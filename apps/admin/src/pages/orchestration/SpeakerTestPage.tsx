import {useCallback, useEffect, useMemo, useState} from 'react'
import {Alert, Button, Card, Flex, Select, Space, Tag, Typography, message} from 'antd'
import {ReloadOutlined, SoundOutlined, StopOutlined} from '@ant-design/icons'
import type {SpeakerTestOutputDto, SpeakerTestStateDto} from '@open-cinema/shared'
import {audioApi} from './client'
import {PageHeading, SectionSkeleton, StableStatusRegion} from '@/components/admin'

const {Text} = Typography

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

  const load = useCallback(async (showSpinner = true, preserveError = false) => {
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
      if (!preserveError) setError(undefined)
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
      await load(false, true)
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

  const testStatus = error ? {
    type: 'error' as const,
    message: 'Speaker test failed',
    description: error,
  } : outputs.length === 0 && !loading ? {
    type: 'info' as const,
    message: 'No testable speaker output',
    description: 'No physical PCM output with a known channel map is currently available. Connect the output and refresh the runtime inventory.',
  } : stopping ? {
    type: 'info' as const,
    message: 'Stopping the test tone…',
  } : pendingChannel ? {
    type: 'info' as const,
    message: `Starting ${pendingChannel}…`,
  } : active.active ? {
    type: 'info' as const,
    message: `Testing ${active.channel ?? 'channel'} on ${active.outputName ?? 'the selected output'}`,
    description: 'The tone stops automatically after two seconds.',
  } : null

  return (
    <Space direction="vertical" size="large" style={{width: '100%'}}>
      <PageHeading
        title="Speaker test"
        description="Play a short test tone on one observed PipeWire channel at a time."
        actions={<Button icon={<ReloadOutlined/>} loading={loading} onClick={() => void load()}>Refresh</Button>}
      />

      <Alert
        type="warning"
        showIcon
        message="Pause other playback and lower the amplifier volume first"
        description="Each test lasts two seconds. This diagnostic mixes directly into the selected physical output and does not change the active audio graph."
      />
      <Card title="Physical output" extra={<Tag>{selected?.channels.length ?? 0} channels</Tag>}>
        {loading && outputs.length === 0 ? <SectionSkeleton rows={4}/> : (
          <Space direction="vertical" size="large" style={{width: '100%'}}>
            <Select
              aria-label="Speaker output"
              value={selectedKey}
              disabled={outputs.length === 0}
              placeholder="No testable output"
              onChange={setSelectedKey}
              options={outputs.map((output) => ({
                value: output.runtimeKey,
                label: output.name,
              }))}
              style={{width: '100%', maxWidth: 560}}
            />
            <Space direction="vertical" size="small" style={{minHeight: 44}}>
              <Text type="secondary">{selected?.description ?? 'Connect a physical PCM output with a known channel map.'}</Text>
              <Text type="secondary">Observed order: {selected?.channels.map((item) => item.position).join(' · ') || 'Not available'}</Text>
            </Space>
            <StableStatusRegion status={testStatus} minHeight={112} label="Speaker test status"/>
            <Flex justify="flex-end">
              <Button
                danger
                aria-label="Stop speaker test"
                icon={<StopOutlined/>}
                loading={stopping}
                disabled={!active.active && !stopping}
                onClick={() => void stop()}
              >
                Stop
              </Button>
            </Flex>
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
        )}
      </Card>
    </Space>
  )
}
