import {useCallback, useEffect, useMemo, useState} from 'react'
import {Alert, Button, Card, Select, Space, Spin, Tag, Typography, message} from 'antd'
import {ReloadOutlined, SoundOutlined, StopOutlined} from '@ant-design/icons'
import type {SpeakerTestOutputDto, SpeakerTestStateDto} from '@open-cinema/shared'
import {audioApi} from './client'

const {Paragraph, Text, Title} = Typography

const inactiveState: SpeakerTestStateDto = {
  active: false,
  token: null,
  runtimeKey: null,
  outputName: null,
  channel: null,
  startedAt: null,
  endsAt: null,
  durationMs: null,
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught)
}

export function SpeakerTestPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [outputs, setOutputs] = useState<SpeakerTestOutputDto[]>([])
  const [selectedKey, setSelectedKey] = useState<string>()
  const [active, setActive] = useState<SpeakerTestStateDto>(inactiveState)
  const [pendingChannel, setPendingChannel] = useState<string>()
  const [stopping, setStopping] = useState(false)

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    try {
      const overview = await audioApi.speakerTest()
      setOutputs(overview.outputs)
      setActive(overview.active)
      setSelectedKey((current) =>
        current && overview.outputs.some((output) => output.runtimeKey === current)
          ? current
          : overview.outputs[0]?.runtimeKey,
      )
      setError(undefined)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [])

  useEffect(() => void load(), [load])

  useEffect(() => {
    if (!active.active) return
    const timer = window.setInterval(() => void load(false), 500)
    return () => window.clearInterval(timer)
  }, [active.active, load])

  const selected = useMemo(
    () => outputs.find((output) => output.runtimeKey === selectedKey),
    [outputs, selectedKey],
  )

  const start = async (channel: string) => {
    if (!selected) return
    setPendingChannel(channel)
    try {
      const state = await audioApi.startSpeakerTest(selected.runtimeKey, channel)
      setActive(state)
      setError(undefined)
    } catch (caught) {
      const detail = errorMessage(caught)
      setError(detail)
      message.error(detail)
      await load(false)
    } finally {
      setPendingChannel(undefined)
    }
  }

  const stop = async () => {
    setStopping(true)
    try {
      setActive(await audioApi.stopSpeakerTest())
      setError(undefined)
    } catch (caught) {
      const detail = errorMessage(caught)
      setError(detail)
      message.error(detail)
    } finally {
      setStopping(false)
    }
  }

  if (loading) return <Spin fullscreen tip="Loading speaker outputs…"/>

  return (
    <Space direction="vertical" size="large" style={{width: '100%'}}>
      <Space style={{width: '100%', justifyContent: 'space-between'}} align="start" wrap>
        <div>
          <Title level={2}>Speaker test</Title>
          <Paragraph>Play a short test tone on one observed PipeWire channel at a time.</Paragraph>
        </div>
        <Button icon={<ReloadOutlined/>} onClick={() => void load()}>Refresh</Button>
      </Space>

      <Alert
        type="warning"
        showIcon
        message="Pause other playback and lower the amplifier volume first"
        description="Each test lasts two seconds. This diagnostic mixes directly into the selected physical output and does not change the active audio graph."
      />
      {error && <Alert type="error" showIcon message="Speaker test failed" description={error}/>

      {outputs.length === 0 ? (
        <Alert
          type="info"
          showIcon
          message="No testable speaker output"
          description="No physical PCM output with a known channel map is currently available. Connect the output and refresh the runtime inventory."
          action={<Button onClick={() => void load()}>Refresh</Button>}
        />
      ) : (
        <Card title="Physical output" extra={<Tag>{selected?.channels.length ?? 0} channels</Tag>}>
          <Space direction="vertical" size="large" style={{width: '100%'}}>
            <Select
              aria-label="Speaker output"
              value={selectedKey}
              onChange={setSelectedKey}
              options={outputs.map((output) => ({
                value: output.runtimeKey,
                label: output.name,
              }))}
              style={{width: '100%', maxWidth: 560}}
            />
            {selected && (
              <Space direction="vertical" size="small">
                <Text type="secondary">{selected.description}</Text>
                <Text type="secondary">Observed order: {selected.channels.map((item) => item.position).join(' · ')}</Text>
              </Space>
            )}
            {active.active && (
              <Alert
                type="info"
                showIcon
                message={(
                  <Space wrap>
                    <Text>Testing</Text>
                    <Tag color="processing">{active.channel}</Tag>
                    <Text>{active.outputName}</Text>
                  </Space>
                )}
                action={(
                  <Button danger aria-label="Stop speaker test" icon={<StopOutlined/>} loading={stopping} onClick={() => void stop()}>
                    Stop
                  </Button>
                )}
              />
            )}
            <Space wrap size={[12, 12]}>
              {selected?.channels.map((channel) => {
                const isActive = active.active && active.runtimeKey === selected.runtimeKey && active.channel === channel.position
                return (
                  <Button
                    key={channel.position}
                    type={isActive ? 'primary' : 'default'}
                    icon={<SoundOutlined/>}
                    loading={pendingChannel === channel.position}
                    disabled={pendingChannel !== undefined || stopping}
                    aria-pressed={isActive}
                    aria-label={`${channel.position} · ${channel.label}`}
                    onClick={() => void start(channel.position)}
                  >
                    {channel.position} · {channel.label}
                  </Button>
                )
              })}
            </Space>
          </Space>
        </Card>
      )}
    </Space>
  )
}
