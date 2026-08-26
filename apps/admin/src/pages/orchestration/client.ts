import {ApiClient, AudioOrchestrationApi} from '@open-cinema/shared'

export const audioApi = new AudioOrchestrationApi({
  client: new ApiClient(import.meta.env.VITE_API_URL || undefined),
})
