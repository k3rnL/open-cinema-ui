import {useCallback, useEffect, useMemo, useState, useSyncExternalStore} from 'react'
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Flex,
  Modal,
  Space,
  Steps,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import {ArrowLeftOutlined, CheckCircleOutlined, PoweroffOutlined, ReloadOutlined} from '@ant-design/icons'
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
import {graphAutosaveNeedsWarning} from './graphAutosave'
import {useGraphAutosave} from './useGraphAutosave'
import {SectionSkeleton, StableStatusRegion} from '@/components/admin'

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
  const [published, setPublished] = useState<GraphRevisionDto>()
  const [deactivating, setDeactivating] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [validationIssues, setValidationIssues] = useState<ValidationIssueDto[]>([])
  const [applyPhase, setApplyPhase] = useState<ApplyPhase>('idle')
  const [applyWorkflow, setApplyWorkflow] = useState<ApplyWorkflow>('draft')
  const [applyError, setApplyError] = useState<string>()

  const createAutosaveDraft = useCallback(async (content: DesiredGraphDocumentDto) => {
    if (!definition) throw new Error('The graph definition is not loaded.')
    return (await audioApi.createRevision(definition.id, content)).value
  }, [definition])
  const saveAutosaveDraft = useCallback(async (
    revisionId: string,
    content: DesiredGraphDocumentDto,
    updateVersion: number,
  ) => (await audioApi.saveDraft(revisionId, content, updateVersion)).value, [])
  const autosave = useGraphAutosave({createDraft: createAutosaveDraft, saveDraft: saveAutosaveDraft})
  const editing = autosave.state.revision ?? undefined
  const document = autosave.state.document ?? undefined
  const savedDocument = autosave.state.baseDocument ?? undefined
  const dirty = autosave.state.localSequence > autosave.state.acknowledgedSequence
  const saving = autosave.state.status === 'saving'
  const conflictVersion = autosave.state.conflictVersion ?? undefined

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
      setPublished(publishedValue)
      autosave.install(selectedRevision ?? null, selectedDocument)
      setValidationIssues(selectedRevision?.validation.issues ?? [])
      setNotice(draftValue
        ? 'Draft loaded. Live audio is unchanged until Apply.'
        : 'Published revision loaded. Your first edit will start and autosave a draft.')
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
  }, [autosave.install, id, store])

  useEffect(() => {
    void load()
    const subscription = new OrchestrationEventSubscription(audioApi, store)
    subscription.connect()
    return () => subscription.close()
  }, [load, store])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!graphAutosaveNeedsWarning(autosave.state)) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [autosave.state])

  const changeDocument = (next: DesiredGraphDocumentDto) => {
    autosave.mutate(next)
    setNotice(editing?.state === 'draft'
      ? 'Saving draft changes… Live audio is unchanged until Apply.'
      : 'Creating an editable draft and saving this change… Live audio is unchanged until Apply.')
  }

  const changeAdvanced = (next: DesiredGraphDocumentDto) => {
    const extensions = {...next.extensions}
    delete extensions.simpleRules
    changeDocument({...next, extensions})
  }

  const saveDraft = useCallback(async (): Promise<GraphRevisionDto | null> => {
    const saved = await autosave.flush()
    if (saved) {
      setValidationIssues(saved.validation.issues)
      setNotice(`Draft saved as version ${saved.updateVersion}. Published and live audio are unchanged.`)
    }
    return saved
  }, [autosave.flush])

  const resolveConflict = async (keepLocal: boolean) => {
    if (!editing) return
    const latest = (await audioApi.revision(editing.id)).value
    if (keepLocal) {
      autosave.rebaseLocal(latest)
      setNotice(`Local edits rebased onto draft version ${latest.updateVersion}; autosave is retrying.`)
      return
    }
    autosave.acceptRemote(latest)
    setValidationIssues(latest.validation.issues)
    setNotice(`Server draft version ${latest.updateVersion} loaded.`)
  }

  const exportLocal = () => {
    if (!document) return
    const blob = new Blob([JSON.stringify(document, null, 2)], {type: 'application/json'})
    const href = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = href
    link.download = `${definition?.name ?? 'open-cinema-graph'}-local.json`
    link.click()
    URL.revokeObjectURL(href)
  }

  const refresh = () => {
    if (!graphAutosaveNeedsWarning(autosave.state)) {
      void load()
      return
    }
    Modal.confirm({
      title: 'Load the server version?',
      content: 'Pending local graph changes will be replaced. You can download a local copy first.',
      okText: 'Load server version',
      okButtonProps: {danger: true},
      cancelText: 'Keep editing',
      onOk: () => load(),
    })
  }

  const validate = async (revision = editing, content = document) => {
    if (!revision || !content) return null
    const result = await audioApi.validateRevision(revision.id, content)
    setValidationIssues(result.issues)
    message[result.valid ? 'success' : 'warning'](result.valid ? 'Draft is valid.' : `${result.issues.length} issue(s) need attention.`)
    return result
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
    if (!editing || !document || !definition) return
    setApplyWorkflow('draft')
    setApplyError(undefined)
    setApplyPhase('saving')
    let saved = editing
    if (editing.state !== 'draft' || graphAutosaveNeedsWarning(autosave.state)) {
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
        autosave.markPublished(result.value)
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
      autosave.markPublished(result.value)
      setPublished(result.value)
      setDefinition({
        ...definition,
        activeRevisionId: result.value.id,
        desiredStateVersion: activation.value.desiredStateVersion + 1,
      })
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

  if (loading) return <Space direction="vertical" size="large" style={{width: '100%'}}><SectionSkeleton rows={2}/><SectionSkeleton rows={8}/></Space>
  if (!definition || !document || !savedDocument) {
    return <Alert type="error" showIcon message="Graph editor unavailable" description={applyError}/>
  }
  if (liveState.connection === 'incompatible') {
    return <Alert type="error" showIcon message="Audio API compatibility error" description={liveState.connectionMessage}/>
  }

  const editable = Boolean(editing)
  const hasDraftWork = editing?.state === 'draft'
    || autosave.state.localSequence > autosave.state.acknowledgedSequence
    || ['pending', 'saving', 'offline', 'failed', 'conflict'].includes(autosave.state.status)
  const simple = selectorRulesFromDocument(document)
  const inputEndpoint = simple.inputEndpointId || endpoints.find((endpoint) => endpoint.direction === 'input')?.id || ''
  const liveReason = liveState.readiness?.blockers.join(', ') || liveState.connectionMessage || 'runtime unavailable'
  const runtime = Object.values(liveState.runtime.projections)
  const phaseIndex = applyWorkflow === 'published'
    ? {idle: -1, saving: 0, validating: 0, publishing: 0, reconciling: 1, converged: 2, failed: 2}[applyPhase]
    : {idle: -1, saving: 0, validating: 1, publishing: 2, reconciling: 3, converged: 4, failed: 4}[applyPhase]
  const pageStatus = conflictVersion !== undefined ? {
    type: 'error' as const,
    message: `Draft conflict with server version ${conflictVersion}`,
    description: 'Your local graph and layout are still present. Rebase and retry, download a local copy, or load the server draft.',
    action: <Space direction="vertical"><Button onClick={() => void resolveConflict(true)}>Keep mine and retry</Button><Button onClick={exportLocal}>Download local copy</Button><Button onClick={() => void resolveConflict(false)}>Load server draft</Button></Space>,
  } : !liveState.readiness?.liveControlsAvailable && definition.kind === 'graph' ? {
    type: 'warning' as const,
    message: 'Apply is paused; editing and autosave remain available',
    description: liveReason,
  } : liveState.recoveryRequired ? {
    type: 'info' as const,
    message: 'Recovering missed live events from a full snapshot',
  } : notice ? {
    type: applyPhase === 'failed' ? 'error' as const : 'info' as const,
    message: notice,
  } : null

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
          <Button icon={<ReloadOutlined/>} onClick={refresh}>Refresh</Button>
          {editing?.state === 'draft' && (
            <>
              <Button onClick={() => void validate()}>Validate</Button>
              <Button disabled={!published} onClick={() => void compare()}>Compare</Button>
              <Button danger onClick={() => void discard()}>Discard draft</Button>
            </>
          )}
          {definition.kind === 'graph' && hasDraftWork && (
              <Button
                type="primary"
                icon={<CheckCircleOutlined/>}
                loading={saving}
                disabled={conflictVersion !== undefined || !liveState.readiness?.liveControlsAvailable}
                title={!liveState.readiness?.liveControlsAvailable ? liveReason : undefined}
                onClick={() => void apply()}
              >
                Apply changes
              </Button>
          )}
          {definition.kind === 'graph' && !hasDraftWork && definition.activeRevisionId && (
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
          {definition.kind === 'graph' && !hasDraftWork && !definition.activeRevisionId && editing?.state === 'published' && (
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
          {definition.kind === 'subgraph' && hasDraftWork && (
            <Button
              type="primary"
              icon={<CheckCircleOutlined/>}
              loading={saving}
              disabled={conflictVersion !== undefined}
              onClick={() => void apply()}
            >
              Publish subgraph
            </Button>
          )}
        </Space>
      </Flex>

      <StableStatusRegion status={pageStatus} minHeight={88}/>
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
        <Tag color={autosave.state.status === 'saved' ? 'green' : autosave.state.status === 'conflict' ? 'red' : autosave.state.status === 'offline' ? 'orange' : 'blue'}>
          Autosave {autosave.state.status}
        </Tag>
        {['offline', 'failed'].includes(autosave.state.status) && <Button size="small" onClick={autosave.retry}>Retry autosave</Button>}
        {autosave.state.error && <Text type="danger">{autosave.state.error}</Text>}
      </Space>
    </Space>
  )
}
