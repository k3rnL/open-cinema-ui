import {useCallback, useEffect, useMemo, useState, useSyncExternalStore} from 'react'
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Flex,
  Modal,
  Space,
  Spin,
  Steps,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import {ArrowLeftOutlined, CheckCircleOutlined, PoweroffOutlined, ReloadOutlined, SaveOutlined} from '@ant-design/icons'
import {Link, useNavigate, useParams} from 'react-router'
import {
  ApiProblemError,
  OrchestrationEventSubscription,
  OrchestrationStore,
  compileSelectorRules,
  selectorRulesFromDocument,
  type CamillaDSPProfileDto,
  type CurrentPlanDto,
  type DesiredGraphDocumentDto,
  type GraphDefinitionDto,
  type GraphRevisionDto,
  type LogicalEndpointDto,
  type NodeTypeDto,
  type ValidationIssueDto,
} from '@open-cinema/shared'
import {AdvancedGraphEditor} from './AdvancedGraphEditor'
import {PlanExplanation} from './PlanExplanation'
import {RuleEditor} from './RuleEditor'
import {audioApi} from './client'

const {Paragraph, Text, Title} = Typography

type ApplyPhase = 'idle' | 'saving' | 'validating' | 'publishing' | 'reconciling' | 'converged' | 'failed'
type ApplyWorkflow = 'draft' | 'published'

interface SubgraphState {
  definition: GraphDefinitionDto
  revisions: GraphRevisionDto[]
}

function emptyDocument(graph: GraphDefinitionDto): DesiredGraphDocumentDto {
  return {
    schemaVersion: 1,
    id: `${graph.kind}:${graph.id}`,
    kind: graph.kind,
    metadata: {name: graph.name, labels: graph.labels},
    parameters: [],
    publicPorts: [],
    conditions: [],
    nodes: [],
    edges: [],
    layout: {viewport: {x: 0, y: 0, zoom: 1}},
  }
}

function issuesFrom(error: unknown): ValidationIssueDto[] {
  if (!(error instanceof ApiProblemError)) return []
  const errors = (error.problem as {errors?: unknown}).errors
  if (!Array.isArray(errors)) return []
  return errors.filter((item): item is ValidationIssueDto =>
    typeof item === 'object' && item !== null && 'path' in item && 'message' in item,
  )
}

function terminalStatus(status: CurrentPlanDto['applied']['status']): boolean {
  return ['converged', 'degraded', 'failed'].includes(status)
}

export function GraphEditorPage() {
  const {id} = useParams<{id: string}>()
  const navigate = useNavigate()
  const store = useMemo(() => new OrchestrationStore(), [])
  const liveState = useSyncExternalStore(store.subscribe, store.getState)
  const [loading, setLoading] = useState(true)
  const [definition, setDefinition] = useState<GraphDefinitionDto>()
  const [catalogue, setCatalogue] = useState<NodeTypeDto[]>([])
  const [endpoints, setEndpoints] = useState<LogicalEndpointDto[]>([])
  const [profiles, setProfiles] = useState<CamillaDSPProfileDto[]>([])
  const [subgraphs, setSubgraphs] = useState<SubgraphState[]>([])
  const [editing, setEditing] = useState<GraphRevisionDto>()
  const [published, setPublished] = useState<GraphRevisionDto>()
  const [document, setDocument] = useState<DesiredGraphDocumentDto>()
  const [savedDocument, setSavedDocument] = useState<DesiredGraphDocumentDto>()
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [conflictVersion, setConflictVersion] = useState<number>()
  const [validationIssues, setValidationIssues] = useState<ValidationIssueDto[]>([])
  const [applyPhase, setApplyPhase] = useState<ApplyPhase>('idle')
  const [applyWorkflow, setApplyWorkflow] = useState<ApplyWorkflow>('draft')
  const [applyError, setApplyError] = useState<string>()

  const currentPlan = useMemo<CurrentPlanDto | null>(() => {
    if (!id) return null
    const planId = liveState.resolved.currentPlanByDefinition[id]
    return {
      definitionId: id,
      applied: liveState.applied.byDefinition[id] ?? {
        status: 'idle',
        currentPlanId: null,
        previousPlanId: null,
        transitionGeneration: 0,
        correlationId: null,
        lastError: null,
        updatedAt: null,
      },
      plan: planId ? liveState.resolved.plans[planId] ?? null : null,
    }
  }, [id, liveState.applied.byDefinition, liveState.resolved])

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const metadata = await audioApi.metadata()
      store.setCompatibility(metadata)
      const [definitions, endpointPage, typePage, profilePage, plans, runtime, readiness] = await Promise.all([
        audioApi.definitions(),
        audioApi.endpoints(),
        audioApi.nodeTypes(),
        audioApi.camilladspProfiles(),
        audioApi.currentPlans(),
        audioApi.runtimeSnapshot(),
        audioApi.readiness(),
      ])
      const selected = definitions.items.find((item) => item.id === id)
      if (!selected) throw new Error('The requested desired graph does not exist.')
      const revisions = (await audioApi.revisions(id)).items
      const ordered = [...revisions].sort((left, right) => right.revisionNumber - left.revisionNumber)
      const draftSummary = ordered.find((item) => item.state === 'draft')
      const publishedSummary = ordered.find((item) => item.id === selected.activeRevisionId)
        ?? ordered.find((item) => item.state === 'published')
      const [draftValue, publishedValue] = await Promise.all([
        draftSummary ? audioApi.revision(draftSummary.id).then((item) => item.value) : Promise.resolve(undefined),
        publishedSummary ? audioApi.revision(publishedSummary.id).then((item) => item.value) : Promise.resolve(undefined),
      ])
      const selectedRevision = draftValue ?? publishedValue
      const selectedDocument = selectedRevision?.content ?? emptyDocument(selected)
      const reusable = definitions.items.filter((item) => item.kind === 'subgraph' && item.id !== id)
      setSubgraphs(await Promise.all(reusable.map(async (item) => ({
        definition: item,
        revisions: (await audioApi.revisions(item.id)).items,
      }))))
      setDefinition(selected)
      setEndpoints(endpointPage.items)
      setCatalogue(typePage.items)
      setProfiles(profilePage.items)
      setEditing(selectedRevision)
      setPublished(publishedValue)
      setDocument(selectedDocument)
      setSavedDocument(selectedDocument)
      setDirty(false)
      setConflictVersion(undefined)
      setValidationIssues(selectedRevision?.validation.issues ?? [])
      setNotice(draftValue ? 'Draft loaded. Live audio is unchanged until Apply.' : 'Published revision loaded read-only. Start a draft to edit.')
      store.installDesired({definitions: definitions.items, endpoints: endpointPage.items, revisions})
      store.installCurrentPlans(plans.items)
      store.replaceRuntime(runtime)
      store.setReadiness(readiness)
      store.selectDefinition(id, selectedRevision?.id ?? null)
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : String(caught)
      setApplyError(detail)
      store.setConnection(caught instanceof Error && caught.name === 'UnsupportedAudioContractError' ? 'incompatible' : 'offline', detail)
    } finally {
      setLoading(false)
    }
  }, [id, store])

  useEffect(() => {
    void load()
    const subscription = new OrchestrationEventSubscription(audioApi, store)
    subscription.connect()
    return () => subscription.close()
  }, [load, store])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const changeDocument = (next: DesiredGraphDocumentDto) => {
    if (editing?.state !== 'draft') {
      setNotice('Start a draft before changing desired audio behavior.')
      return
    }
    setDocument(next)
    setDirty(true)
    setNotice('Unsaved draft changes. Save does not alter live audio.')
  }

  const changeAdvanced = (next: DesiredGraphDocumentDto) => {
    const extensions = {...next.extensions}
    delete extensions.simpleRules
    changeDocument({...next, extensions})
  }

  const saveDraft = useCallback(async (): Promise<GraphRevisionDto | null> => {
    if (!editing || editing.state !== 'draft' || !document) return editing ?? null
    setSaving(true)
    try {
      const result = await audioApi.saveDraft(editing.id, document, editing.updateVersion)
      const saved = result.value
      const canonicalDocument = saved.content ?? document
      setEditing(saved)
      setDocument(canonicalDocument)
      setSavedDocument(canonicalDocument)
      setValidationIssues(saved.validation.issues)
      setDirty(false)
      setConflictVersion(undefined)
      setNotice(`Draft saved as version ${saved.updateVersion}. Published and live audio are unchanged.`)
      message.success('Draft saved. Live audio was not changed.')
      return saved
    } catch (caught) {
      if (caught instanceof ApiProblemError && caught.status === 412) {
        setConflictVersion((caught.problem as {currentVersion?: number}).currentVersion)
        setNotice('Another editor changed this draft. Your local edits are preserved below.')
      } else {
        setNotice(caught instanceof Error ? caught.message : String(caught))
      }
      return null
    } finally {
      setSaving(false)
    }
  }, [document, editing])

  const resolveConflict = async (keepLocal: boolean) => {
    if (!editing) return
    const latest = (await audioApi.revision(editing.id)).value
    setEditing(latest)
    setConflictVersion(undefined)
    if (keepLocal) {
      setNotice(`Local edits rebased onto draft version ${latest.updateVersion}; review and Save again.`)
      return
    }
    const latestDocument = latest.content ?? document
    setDocument(latestDocument)
    setSavedDocument(latestDocument)
    setDirty(false)
    setValidationIssues(latest.validation.issues)
    setNotice(`Server draft version ${latest.updateVersion} loaded.`)
  }

  const validate = async (revision = editing, content = document) => {
    if (!revision || !content) return null
    const result = await audioApi.validateRevision(revision.id, content)
    setValidationIssues(result.issues)
    message[result.valid ? 'success' : 'warning'](result.valid ? 'Draft is valid.' : `${result.issues.length} issue(s) need attention.`)
    return result
  }

  const startDraft = async () => {
    if (!definition || !document) return
    const created = await audioApi.createRevision(definition.id, published?.content ?? document)
    const next = created.value
    const nextDocument = next.content ?? document
    setEditing(next)
    setDocument(nextDocument)
    setSavedDocument(nextDocument)
    setDirty(false)
    setValidationIssues(next.validation.issues)
    setNotice('Editable draft created. Active audio did not change.')
  }

  const discard = async () => {
    if (!editing || editing.state !== 'draft') return
    Modal.confirm({
      title: 'Discard this draft?',
      content: 'The published revision and live audio remain unchanged.',
      okText: 'Discard draft',
      okButtonProps: {danger: true},
      onOk: async () => {
        await audioApi.discardDraft(editing.id, editing.updateVersion)
        await load()
      },
    })
  }

  const compare = async () => {
    if (!editing || !published || editing.id === published.id) return
    const result = await audioApi.compareRevisions(published.id, editing.id)
    Modal.info({
      title: 'Draft compared with active published revision',
      width: 720,
      content: <pre style={{maxHeight: 420, overflow: 'auto', whiteSpace: 'pre-wrap'}}>{JSON.stringify(result, null, 2)}</pre>,
    })
  }

  const followReconciliation = async (revisionId: string) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const current = await audioApi.currentPlans(id)
      store.installCurrentPlans(current.items)
      const plan = current.items.find((item) => item.definitionId === id)
      if (plan?.plan?.revisionId === revisionId && terminalStatus(plan.applied.status)) {
        if (plan.applied.status === 'failed') {
          setApplyPhase('failed')
          setApplyError(JSON.stringify(plan.applied.lastError ?? 'Reconciliation failed.'))
        } else {
          setApplyPhase('converged')
          setNotice(`Applied revision converged with status ${plan.applied.status}.`)
        }
        return
      }
      await new Promise((resolve) => window.setTimeout(resolve, 500))
    }
    setNotice('Revision is active. Reconciliation is still progressing and will continue through live events.')
  }

  const apply = async () => {
    if (!editing || editing.state !== 'draft' || !document || !definition) return
    setApplyWorkflow('draft')
    setApplyError(undefined)
    setApplyPhase('saving')
    let saved = editing
    if (dirty) {
      const result = await saveDraft()
      if (!result) {
        setApplyPhase('failed')
        setApplyError('Draft save failed; prior active audio was preserved.')
        return
      }
      saved = result
    }
    setApplyPhase('validating')
    const validation = await validate(saved, saved.content ?? document)
    if (!validation?.valid) {
      setApplyPhase('failed')
      setApplyError('Canonical validation rejected the saved draft. The prior active revision is unchanged.')
      return
    }
    try {
      setApplyPhase('publishing')
      if (definition.kind === 'subgraph') {
        const result = await audioApi.publishRevision(saved.id, saved.updateVersion)
        setEditing(result.value)
        setPublished(result.value)
        setApplyPhase('converged')
        setNotice('Reusable subgraph revision published. Parent graphs remain pinned to their selected version.')
        return
      }
      const activation = await audioApi.activation(definition.id)
      const rules = selectorRulesFromDocument(saved.content ?? document)
      const result = await audioApi.applyDraftRevision(
        saved.id,
        saved.updateVersion,
        activation.value.desiredStateVersion,
        {},
        rules.scene ? {active: rules.scene} : {},
      )
      setEditing(result.value)
      setPublished(result.value)
      setDefinition({
        ...definition,
        activeRevisionId: result.value.id,
        desiredStateVersion: activation.value.desiredStateVersion + 1,
      })
      setSavedDocument(result.value.content ?? saved.content ?? document)
      setDirty(false)
      setApplyPhase('reconciling')
      setNotice('Revision published and activated atomically. Following reconciliation…')
      await followReconciliation(result.value.id)
    } catch (caught) {
      const issues = issuesFrom(caught)
      if (issues.length) setValidationIssues(issues)
      setApplyPhase('failed')
      setApplyError(`${caught instanceof Error ? caught.message : String(caught)} Prior active audio was preserved.`)
    }
  }

  const applyPublished = async () => {
    if (!editing || editing.state !== 'published' || !document || !definition || definition.kind !== 'graph') return
    setApplyWorkflow('published')
    setApplyError(undefined)
    setApplyPhase('publishing')
    try {
      const activation = await audioApi.activation(definition.id)
      const rules = selectorRulesFromDocument(document)
      const result = await audioApi.activateRevision(
        editing.id,
        activation.value.desiredStateVersion,
        {},
        rules.scene ? {active: rules.scene} : {},
      )
      setDefinition({
        ...definition,
        activeRevisionId: editing.id,
        desiredStateVersion: result.value.desiredStateVersion,
      })
      setApplyPhase('reconciling')
      setNotice(`Published revision ${editing.revisionNumber} activated. Following reconciliation…`)
      await followReconciliation(editing.id)
    } catch (caught) {
      setApplyPhase('failed')
      setApplyError(`${caught instanceof Error ? caught.message : String(caught)} Prior active audio was preserved.`)
    }
  }

  const followDeactivation = async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const current = await audioApi.currentPlans(id)
      store.installCurrentPlans(current.items)
      const plan = current.items.find((item) => item.definitionId === id)
      if (plan?.applied.status === 'idle' && plan.applied.currentPlanId === null) {
        setNotice('Graph deactivated. Its saved design is unchanged and its managed routes are removed.')
        return
      }
      if (plan?.applied.status === 'failed') {
        throw new Error(JSON.stringify(plan.applied.lastError ?? 'Graph cleanup failed.'))
      }
      await new Promise((resolve) => window.setTimeout(resolve, 500))
    }
    setNotice('Graph is disabled. Runtime cleanup is still progressing through live reconciliation.')
  }

  const deactivate = () => {
    if (!definition || definition.kind !== 'graph' || !definition.activeRevisionId) return
    Modal.confirm({
      title: `Deactivate ${definition.name}?`,
      content: dirty
        ? 'Managed routes will be removed. Your unsaved local changes and saved draft remain available in this editor.'
        : 'Managed routes will be removed. The graph, drafts, published revisions, and layout remain saved.',
      okText: 'Deactivate graph',
      okButtonProps: {danger: true},
      onOk: async () => {
        setDeactivating(true)
        try {
          const current = await audioApi.activation(definition.id)
          const result = await audioApi.deactivateGraph(
            definition.id,
            current.value.desiredStateVersion,
          )
          setDefinition({
            ...definition,
            activeRevisionId: null,
            desiredStateVersion: result.value.desiredStateVersion,
          })
          setNotice('Graph disabled. Following managed-route cleanup…')
          message.success('Graph disabled. Runtime cleanup has started.')
          void followDeactivation().catch((caught) => {
            const detail = caught instanceof Error ? caught.message : String(caught)
            setNotice(`Graph is disabled, but runtime cleanup failed: ${detail}`)
            message.error(detail)
          })
        } catch (caught) {
          const detail = caught instanceof Error ? caught.message : String(caught)
          setNotice(`Graph deactivation failed: ${detail}`)
          message.error(detail)
          throw caught
        } finally {
          setDeactivating(false)
        }
      },
    })
  }

  const createSubgraph = async () => {
    const created = await audioApi.createDefinition({name: `Reusable processing ${subgraphs.length + 1}`, kind: 'subgraph', labels: {}})
    const revision = (await audioApi.createRevision(created.id, emptyDocument(created))).value
    setSubgraphs((items) => [...items, {definition: created, revisions: [revision]}])
    message.success('Reusable subgraph draft created. Open it from Audio graphs to define and publish its interface.')
  }

  if (loading) return <Spin fullscreen tip="Loading graph editor…"/>
  if (!definition || !document || !savedDocument) {
    return <Alert type="error" showIcon message="Graph editor unavailable" description={applyError}/>
  }
  if (liveState.connection === 'incompatible') {
    return <Alert type="error" showIcon message="Audio API compatibility error" description={liveState.connectionMessage}/>
  }

  const editable = editing?.state === 'draft'
  const simple = selectorRulesFromDocument(document)
  const inputEndpoint = simple.inputEndpointId || endpoints.find((endpoint) => endpoint.direction === 'input')?.id || ''
  const liveReason = liveState.readiness?.blockers.join(', ') || liveState.connectionMessage || 'runtime unavailable'
  const runtime = Object.values(liveState.runtime.projections)
  const phaseIndex = applyWorkflow === 'published'
    ? {idle: -1, saving: 0, validating: 0, publishing: 0, reconciling: 1, converged: 2, failed: 2}[applyPhase]
    : {idle: -1, saving: 0, validating: 1, publishing: 2, reconciling: 3, converged: 4, failed: 4}[applyPhase]

  return (
    <Space direction="vertical" size="middle" style={{width: '100%'}}>
      <Breadcrumb items={[
        {title: <Link to="/graphs">Audio graphs</Link>},
        {title: definition.name},
      ]}/>
      <Flex justify="space-between" align="start" gap={16} wrap>
        <Space align="start">
          <Button type="text" icon={<ArrowLeftOutlined/>} aria-label="Back to audio graphs" onClick={() => navigate('/graphs')}/>
          <div>
            <Title level={2} style={{marginBottom: 0}}>{definition.name}</Title>
            <Paragraph type="secondary">{definition.kind === 'subgraph' ? 'Reusable subgraph' : 'Desired audio graph'} · revision {editing?.revisionNumber ?? 'new'}</Paragraph>
          </div>
        </Space>
        <Space wrap>
          <Button icon={<ReloadOutlined/>} onClick={() => void load()}>Refresh</Button>
          {definition.kind === 'graph' && definition.activeRevisionId && (
            <Button
              danger
              icon={<PoweroffOutlined/>}
              loading={deactivating}
              disabled={!liveState.readiness?.liveControlsAvailable}
              title={!liveState.readiness?.liveControlsAvailable ? liveReason : undefined}
              onClick={deactivate}
            >
              Deactivate
            </Button>
          )}
          {editing?.state === 'published' && (
            <>
              <Button type={definition.kind === 'subgraph' ? 'primary' : 'default'} onClick={() => void startDraft()}>Start draft</Button>
              {definition.kind === 'graph' && (
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined/>}
                  disabled={!liveState.readiness?.liveControlsAvailable}
                  title={!liveState.readiness?.liveControlsAvailable ? liveReason : undefined}
                  onClick={() => void applyPublished()}
                >
                  Apply
                </Button>
              )}
            </>
          )}
          {editable && (
            <>
              <Button loading={saving} disabled={conflictVersion !== undefined} icon={<SaveOutlined/>} onClick={() => void saveDraft()}>
                Save draft
              </Button>
              <Button onClick={() => void validate()}>Validate</Button>
              <Button disabled={!published} onClick={() => void compare()}>Compare</Button>
              <Button danger onClick={() => void discard()}>Discard draft</Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined/>}
                disabled={conflictVersion !== undefined || (definition.kind === 'graph' && !liveState.readiness?.liveControlsAvailable)}
                title={definition.kind === 'graph' && !liveState.readiness?.liveControlsAvailable ? liveReason : undefined}
                onClick={() => void apply()}
              >
                {definition.kind === 'graph' ? 'Apply' : 'Publish subgraph'}
              </Button>
            </>
          )}
        </Space>
      </Flex>

      {!liveState.readiness?.liveControlsAvailable && definition.kind === 'graph' && (
        <Alert type="warning" showIcon message="Apply is paused; draft editing and Save remain available" description={liveReason}/>
      )}
      {liveState.recoveryRequired && <Alert type="info" showIcon message="Recovering missed live events from a full snapshot"/>}
      {conflictVersion !== undefined && (
        <Alert
          type="error"
          showIcon
          message={`Draft conflict with server version ${conflictVersion}`}
          description="Your local graph and layout are still present. Choose whether to rebase them onto the current version or load the server draft."
          action={<Space direction="vertical"><Button onClick={() => void resolveConflict(true)}>Keep mine and review</Button><Button onClick={() => void resolveConflict(false)}>Load server draft</Button></Space>}
        />
      )}
      {notice && <Alert type={applyPhase === 'failed' ? 'error' : 'info'} showIcon message={notice}/>
      {applyPhase !== 'idle' && (
        <Card size="small" title="Apply progress">
          <Steps
            current={phaseIndex}
            status={applyPhase === 'failed' ? 'error' : applyPhase === 'converged' ? 'finish' : 'process'}
            items={applyWorkflow === 'published'
              ? [
                  {title: 'Activate published revision'},
                  {title: 'Reconcile'},
                  {title: 'Complete'},
                ]
              : [
                  {title: 'Save draft'},
                  {title: 'Validate'},
                  {title: definition.kind === 'graph' ? 'Publish + activate' : 'Publish'},
                  {title: definition.kind === 'graph' ? 'Reconcile' : 'Pinned revisions safe'},
                  {title: 'Complete'},
                ]}
          />
          {applyError && <Alert type="error" showIcon message="Apply stopped safely" description={applyError} style={{marginTop: 12}}/>}
        </Card>
      )}

      <Tabs
        size="large"
        items={[
          {
            key: 'advanced',
            label: 'Advanced graph',
            children: (
              <AdvancedGraphEditor
                value={document}
                savedValue={savedDocument}
                editable={editable}
                catalogue={catalogue}
                endpoints={endpoints}
                profiles={profiles}
                validationIssues={validationIssues}
                currentPlan={currentPlan}
                runtime={runtime}
                subgraphs={subgraphs}
                onChange={changeAdvanced}
                onCreateSubgraph={createSubgraph}
                onPreviewUpgrade={async (currentRevision, targetRevision) => {
                  const comparison = await audioApi.compareRevisions(currentRevision, targetRevision)
                  if (comparison.semanticEqual) return 'The revisions are semantically equivalent; only layout differs.'
                  const changes = Object.values(comparison.collections)
                    .map((item) => item.added.length + item.removed.length + item.changed.length)
                    .reduce((sum, count) => sum + count, 0)
                  return `${changes} interface or content item(s) differ. Review parameter and port bindings before upgrading.`
                }}
                onSaveDraft={saveDraft}
              />
            ),
          },
          {
            key: 'rules',
            label: 'Simple rules',
            children: (
              <RuleEditor
                graphId={document.id}
                graphName={definition.name}
                endpoints={endpoints}
                inputEndpointId={inputEndpoint}
                rules={simple.rules}
                scene={simple.scene}
                supported={simple.supported && definition.kind === 'graph'}
                editable={editable}
                onInputChange={(nextInput) => changeDocument(compileSelectorRules(document.id, definition.name, nextInput, simple.rules, simple.scene))}
                onRulesChange={(_, nextDocument) => changeDocument(nextDocument)}
                onSceneChange={(scene) => changeDocument(compileSelectorRules(document.id, definition.name, inputEndpoint, simple.rules, scene))}
              />
            ),
          },
          {
            key: 'explanation',
            label: 'Resolved & runtime explanation',
            children: <PlanExplanation current={currentPlan}/>,
          },
        ]}
      />
      <Space wrap>
        <Tag>Desired revision {editing?.state ?? 'new'}</Tag>
        <Tag color="green">Applied {currentPlan?.applied.status ?? 'idle'}</Tag>
        <Tag color={liveState.connection === 'online' ? 'blue' : 'orange'}>Live events {liveState.connection}</Tag>
        {dirty && <Text type="warning">Unsaved changes</Text>}
      </Space>
    </Space>
  )
}
