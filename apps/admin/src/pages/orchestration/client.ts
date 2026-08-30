import {ApiClient, AudioOrchestrationApi, SystemApi} from '@open-cinema/shared'

const client = new ApiClient(import.meta.env.VITE_API_URL || undefined)
export const audioApi = new AudioOrchestrationApi({
  client,
})
export const systemApi = new SystemApi(client)
