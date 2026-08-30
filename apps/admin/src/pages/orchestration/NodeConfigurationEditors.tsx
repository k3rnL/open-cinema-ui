import {Alert, Button, Card, Form, Input, InputNumber, Select, Space, Switch, Typography} from 'antd'
import {DeleteOutlined, PlusOutlined} from '@ant-design/icons'
import type {CamillaDSPProfileDto, JsonObject, JsonValue, LogicalEndpointDto} from '@open-cinema/shared'
import {KeyValueBindings} from './GraphInterfaceEditor'

const {Text} = Typography

function object(value: JsonValue | undefined): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
}

function strings(value: JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

export function EndpointReferenceEditor({
  configuration,
  endpoints,
  onChange,
}: {
  configuration: JsonObject
  endpoints: LogicalEndpointDto[]
  onChange: (value: JsonObject) => void
}) {
  const direction = configuration.direction === 'input' ? 'input' : 'output'
  const endpointSelector = object(configuration.endpointSelector)
  const legacy = configuration.selector !== undefined
  const mode = configuration.logicalEndpointId !== undefined ? 'device' : configuration.endpointSelector !== undefined ? 'group' : legacy ? 'legacy' : 'device'
  const endpointOptions = endpoints.filter((endpoint) => endpoint.direction === direction).map((endpoint) => ({value: endpoint.id, label: endpoint.name}))
  const setMode = (next: string) => {
    if (next === 'device') onChange({direction, logicalEndpointId: endpointOptions[0]?.value ?? ''})
    if (next === 'group') onChange({direction, endpointSelector: {version: 1, direction, requiredTags: []}})
  }
  const updateSelector = (changes: JsonObject) => onChange({
    direction,
    endpointSelector: {...endpointSelector, version: 1, direction, ...changes},
  })
  return (
    <>
      <Form.Item label="Reference type" extra="Choose one known logical device or a reusable group resolved at runtime.">
        <Select
          aria-label="Endpoint reference type"
          value={mode}
          options={[
            {value: 'device', label: 'Specific device'},
            {value: 'group', label: 'Device group'},
            ...(legacy ? [{value: 'legacy', label: 'Legacy selector (read only)', disabled: true}] : []),
          ]}
          onChange={setMode}
        />
      </Form.Item>
      <Form.Item label="Direction">
        <Select
          aria-label="Endpoint direction"
          value={direction}
          options={[{value: 'input', label: 'Audio input'}, {value: 'output', label: 'Audio output'}]}
          onChange={(nextDirection) => {
            if (mode === 'group') onChange({direction: nextDirection, endpointSelector: {...endpointSelector, version: 1, direction: nextDirection}})
            else onChange({direction: nextDirection, logicalEndpointId: endpoints.find((endpoint) => endpoint.direction === nextDirection)?.id ?? ''})
          }}
        />
      </Form.Item>
      {mode === 'device' ? (
        <Form.Item label="Logical device">
          <Select
            aria-label="Logical endpoint"
            showSearch
            optionFilterProp="label"
            placeholder="Choose device"
            value={typeof configuration.logicalEndpointId === 'string' && configuration.logicalEndpointId ? configuration.logicalEndpointId : undefined}
            options={endpointOptions}
            onChange={(logicalEndpointId) => onChange({direction, logicalEndpointId})}
          />
        </Form.Item>
      ) : mode === 'group' ? (
        <>
          <Form.Item label="Required device tags" extra="Every selected device must have all of these tags.">
            <Select aria-label="Required device tags" mode="tags" value={strings(endpointSelector.requiredTags)} placeholder="Type a tag and press Enter" onChange={(requiredTags) => updateSelector({requiredTags})}/>
          </Form.Item>
          <Form.Item label="Preferred groups" extra="Groups are tried in this order; drag ordering is represented left to right.">
            <Select aria-label="Preferred device groups" mode="tags" value={strings(endpointSelector.orderedGroups)} placeholder="Type a group and press Enter" onChange={(orderedGroups) => updateSelector({orderedGroups})}/>
          </Form.Item>
          {!strings(endpointSelector.requiredTags).length && !strings(endpointSelector.orderedGroups).length ? <Alert type="warning" showIcon message="Add at least one tag or preferred group."/> : null}
        </>
      ) : (
        <Alert type="warning" showIcon message="This graph contains an old selector" description="Choose Specific device or Device group above to replace it with the supported editor."/>
      )}
    </>
  )
}

function LayoutsEditor({value, onChange}: {value: JsonValue | undefined; onChange: (value: JsonValue) => void}) {
  const layouts = Array.isArray(value) ? value.map(object) : []
  return (
    <Space direction="vertical" style={{width: '100%'}}>
      {layouts.map((layout, index) => (
        <Card key={index} size="small" extra={<Button danger type="text" aria-label={`Remove channel layout ${index + 1}`} icon={<DeleteOutlined/>} onClick={() => onChange(layouts.filter((_, itemIndex) => itemIndex !== index))}/>}>
          <Space direction="vertical" style={{width: '100%'}}>
            <InputNumber aria-label={`Channel layout ${index + 1} channel count`} addonBefore="Channels" min={1} max={64} value={typeof layout.channels === 'number' ? layout.channels : 2} style={{width: '100%'}} onChange={(channels) => onChange(layouts.map((item, itemIndex) => itemIndex === index ? {...item, channels: channels ?? 2} : item))}/>
            <Select aria-label={`Channel layout ${index + 1} positions`} mode="tags" value={strings(layout.positions)} placeholder="FL, FR, FC…" onChange={(positions) => onChange(layouts.map((item, itemIndex) => itemIndex === index ? {...item, positions} : item))}/>
          </Space>
        </Card>
      ))}
      <Button type="dashed" block icon={<PlusOutlined/>} onClick={() => onChange([...layouts, {channels: 2, positions: ['FL', 'FR']}])}>Add channel layout</Button>
    </Space>
  )
}

export function SignalContractEditor({value, onChange}: {value: JsonValue | undefined; onChange: (value: JsonValue) => void}) {
  const contract = object(value)
  const update = (name: string, next: JsonValue) => onChange({...contract, [name]: next})
  const latency = object(contract.latencyMs)
  const mediaKind = contract.mediaKind === 'control' ? 'control' : 'audio'
  return (
    <Space direction="vertical" style={{width: '100%'}}>
      <Form.Item label="Media" required><Select aria-label="Target media kind" value={mediaKind} options={[{value: 'audio', label: 'Audio'}, {value: 'control', label: 'Control'}]} onChange={(next) => onChange(next === 'audio' ? {...contract, mediaKind: next, content: contract.content ?? 'any'} : {mediaKind: next})}/></Form.Item>
      {mediaKind === 'audio' ? (
        <>
          <Form.Item label="Audio content"><Select aria-label="Target audio content" value={String(contract.content ?? 'any')} options={['any', 'pcm', 'encoded'].map((item) => ({value: item, label: item === 'any' ? 'Any audio' : item.toUpperCase()}))} onChange={(next) => update('content', next)}/></Form.Item>
          <Form.Item label="Sample formats" extra="Leave empty to accept any format."><Select aria-label="Target sample formats" mode="tags" value={strings(contract.sampleFormats)} options={['U8', 'S16LE', 'S24LE', 'S24_32LE', 'S32LE', 'FLOAT32LE', 'FLOAT64LE'].map((item) => ({value: item, label: item}))} onChange={(next) => update('sampleFormats', next)}/></Form.Item>
          <Form.Item label="Sample rates" extra="Values are in hertz; leave empty to accept any rate."><Select aria-label="Target sample rates" mode="tags" value={strings(contract.rates)} options={[44100, 48000, 88200, 96000, 192000].map((item) => ({value: String(item), label: `${item / 1000} kHz`}))} onChange={(next) => update('rates', next.map(Number))}/></Form.Item>
          <Form.Item label="Codecs" extra="Used for encoded audio; leave empty to accept any codec."><Select aria-label="Target codecs" mode="tags" value={strings(contract.codecs)} options={['ac3', 'eac3', 'dts', 'aac'].map((item) => ({value: item, label: item.toUpperCase()}))} onChange={(next) => update('codecs', next)}/></Form.Item>
          <Form.Item label="Channel layouts"><LayoutsEditor value={contract.layouts} onChange={(next) => update('layouts', next)}/></Form.Item>
        </>
      ) : null}
      <Form.Item label="Latency range" extra="Optional minimum and maximum processing latency, in milliseconds.">
        <Space.Compact block>
          <InputNumber aria-label="Minimum latency" addonBefore="Min" min={0} value={typeof latency.minimum === 'number' ? latency.minimum : undefined} onChange={(minimum) => update('latencyMs', {...latency, minimum: minimum ?? 0})}/>
          <InputNumber aria-label="Maximum latency" addonBefore="Max" min={0} value={typeof latency.maximum === 'number' ? latency.maximum : undefined} onChange={(maximum) => update('latencyMs', {...latency, maximum: maximum ?? 0})}/>
        </Space.Compact>
      </Form.Item>
      <Form.Item label="Provided capabilities"><Select aria-label="Provided capabilities" mode="tags" value={strings(contract.capabilities)} placeholder="Type a capability" onChange={(next) => update('capabilities', next)}/></Form.Item>
      <Form.Item label="Required capabilities"><Select aria-label="Required capabilities" mode="tags" value={strings(contract.requiredCapabilities)} placeholder="Type a capability" onChange={(next) => update('requiredCapabilities', next)}/></Form.Item>
    </Space>
  )
}

export function CamillaDSPConfigurationEditor({
  configuration,
  endpoints,
  profiles,
  onChange,
}: {
  configuration: JsonObject
  endpoints: LogicalEndpointDto[]
  profiles: CamillaDSPProfileDto[]
  onChange: (value: JsonObject) => void
}) {
  const configuredProfiles = configuration.profiles
  const perOutput = Array.isArray(configuredProfiles)
  const outputProfiles: JsonObject[] = perOutput ? configuredProfiles.map(object) : []
  const profileOptions = profiles.map((profile) => ({value: profile.profileId, label: `${profile.name} · v${profile.version}`}))
  const outputOptions = endpoints.filter((endpoint) => endpoint.direction === 'output').map((endpoint) => ({value: endpoint.id, label: endpoint.name}))
  const setProfile = (profileId: string, base: JsonObject): JsonObject => {
    const profile = profiles.find((item) => item.profileId === profileId)
    return {...base, profile: profileId, profileVersion: profile?.version ?? 1}
  }
  const common = (next: JsonObject) => ({
    ...next,
    ...(configuration.bypassAllowed !== undefined ? {bypassAllowed: configuration.bypassAllowed} : {}),
    ...(configuration.resourcePriority !== undefined ? {resourcePriority: configuration.resourcePriority} : {}),
    ...(configuration.channelAdaptation !== undefined ? {channelAdaptation: configuration.channelAdaptation} : {}),
  })
  const adaptation = object(configuration.channelAdaptation)
  return (
    <Space direction="vertical" style={{width: '100%'}}>
      <Form.Item label="Profile selection" extra="Use one profile everywhere, or choose a profile for each possible output device.">
        <Select aria-label="CamillaDSP profile selection mode" value={perOutput ? 'per-output' : 'single'} options={[{value: 'single', label: 'One profile'}, {value: 'per-output', label: 'Profile per output device'}]} onChange={(mode) => {
          if (mode === 'single') {
            const profile = profiles[0]
            onChange(common({profileId: profile?.profileId ?? '', profileVersion: profile?.version ?? 1, parameterBindings: {}}))
          } else {
            const profile = profiles[0]
            onChange(common({profiles: outputOptions.length && profile ? [{output: outputOptions[0].value, profile: profile.profileId, profileVersion: profile.version, parameterBindings: {}}] : []}))
          }
        }}/>
      </Form.Item>
      {perOutput ? (
        <Space direction="vertical" style={{width: '100%'}}>
          {outputProfiles.map((item, index) => (
            <Card key={index} size="small" title={`Output profile ${index + 1}`} extra={<Button danger type="text" aria-label={`Remove output profile ${index + 1}`} icon={<DeleteOutlined/>} onClick={() => onChange({...configuration, profiles: outputProfiles.filter((_, itemIndex) => itemIndex !== index)})}/>}>
              <Form.Item label="Output device"><Select aria-label={`Output profile ${index + 1} device`} value={typeof item.output === 'string' ? item.output : undefined} options={outputOptions} showSearch optionFilterProp="label" onChange={(output) => onChange({...configuration, profiles: outputProfiles.map((entry, itemIndex) => itemIndex === index ? {...entry, output} : entry)})}/></Form.Item>
              <Form.Item label="CamillaDSP profile"><Select aria-label={`Output profile ${index + 1} profile`} value={typeof item.profile === 'string' ? item.profile : undefined} options={profileOptions} showSearch optionFilterProp="label" onChange={(profileId) => onChange({...configuration, profiles: outputProfiles.map((entry, itemIndex) => itemIndex === index ? setProfile(profileId, entry) : entry)})}/></Form.Item>
              <Form.Item label="Profile parameters" extra="Parameter values may be text, numbers, booleans, or structured values."><KeyValueBindings value={object(item.parameterBindings)} onChange={(parameterBindings) => onChange({...configuration, profiles: outputProfiles.map((entry, itemIndex) => itemIndex === index ? {...entry, parameterBindings} : entry)})}/></Form.Item>
            </Card>
          ))}
          <Button type="dashed" block icon={<PlusOutlined/>} disabled={!outputOptions.length || !profiles.length} onClick={() => {
            const profile = profiles[0]
            if (profile) onChange({...configuration, profiles: [...outputProfiles, {output: outputOptions[0].value, profile: profile.profileId, profileVersion: profile.version, parameterBindings: {}}]})
          }}>Add output profile</Button>
        </Space>
      ) : (
        <>
          <Form.Item label="CamillaDSP profile"><Select aria-label="CamillaDSP profile" value={typeof configuration.profileId === 'string' ? configuration.profileId : undefined} options={profileOptions} showSearch optionFilterProp="label" onChange={(profileId) => {
            const profile = profiles.find((item) => item.profileId === profileId)
            onChange({...configuration, profileId, profileVersion: profile?.version ?? 1})
          }}/></Form.Item>
          <Form.Item label="Profile parameters"><KeyValueBindings value={object(configuration.parameterBindings)} onChange={(parameterBindings) => onChange({...configuration, parameterBindings})}/></Form.Item>
        </>
      )}
      <Form.Item label="Allow bypass"><Switch aria-label="Allow CamillaDSP bypass" checked={configuration.bypassAllowed === true} onChange={(bypassAllowed) => onChange({...configuration, bypassAllowed})}/></Form.Item>
      <Form.Item label="Resource priority"><InputNumber aria-label="CamillaDSP resource priority" value={typeof configuration.resourcePriority === 'number' ? configuration.resourcePriority : undefined} onChange={(resourcePriority) => onChange({...configuration, resourcePriority: resourcePriority ?? 0})}/></Form.Item>
      <Form.Item label="Channel adaptation"><Switch aria-label="Enable channel adaptation" checked={configuration.channelAdaptation !== undefined && configuration.channelAdaptation !== null} onChange={(enabled) => onChange({...configuration, channelAdaptation: enabled ? {mixer: '', reason: ''} : null})}/></Form.Item>
      {configuration.channelAdaptation !== undefined && configuration.channelAdaptation !== null ? (
        <Card size="small">
          <Form.Item label="Mixer"><Input aria-label="Channel adaptation mixer" value={typeof adaptation.mixer === 'string' ? adaptation.mixer : ''} placeholder="Configured CamillaDSP mixer name" onChange={(event) => onChange({...configuration, channelAdaptation: {...adaptation, mixer: event.target.value}})}/></Form.Item>
          <Form.Item label="Reason"><Input aria-label="Channel adaptation reason" value={typeof adaptation.reason === 'string' ? adaptation.reason : ''} placeholder="Why this channel conversion is required" onChange={(event) => onChange({...configuration, channelAdaptation: {...adaptation, reason: event.target.value}})}/></Form.Item>
        </Card>
      ) : null}
      {!profiles.length ? <Alert type="warning" showIcon message="No CamillaDSP profiles are available."/> : null}
      <Text type="secondary">Profile revisions are pinned automatically when you make a selection.</Text>
    </Space>
  )
}
