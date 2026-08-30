import {ApiClient, PluginPlatformApi} from '@open-cinema/shared'

export const pluginClient = new ApiClient(import.meta.env.VITE_API_URL || undefined)
export const pluginApi = new PluginPlatformApi(pluginClient)
