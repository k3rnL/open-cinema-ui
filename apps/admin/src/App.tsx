import {Refine} from '@refinedev/core'
import {RefineKbar, RefineKbarProvider} from '@refinedev/kbar'
import routerProvider, {
    NavigateToResource,
    UnsavedChangesNotifier,
    DocumentTitleHandler,
} from '@refinedev/react-router'
import dataProvider from '@refinedev/simple-rest'
import {BrowserRouter, Route, Routes, Outlet} from 'react-router'
import {ConfigProvider, App as AntdApp} from 'antd'
import { PartitionOutlined, UsbOutlined, NodeExpandOutlined } from '@ant-design/icons'
import {useNotificationProvider, ThemedLayout, ErrorComponent} from '@refinedev/antd'
import '@refinedev/antd/dist/reset.css'
import DeviceList from "@/pages/devices/list.tsx";
import DeviceCreate from "@/pages/devices/create.tsx";
import PipelineList from "@/pages/pipelines/list.tsx";
import PipelineCreate from "@/pages/pipelines/create.tsx";
import MixerList from "@/pages/mixers/list.tsx";
import MixerCreate from "@/pages/mixers/create.tsx";
import MixerEdit from "@/pages/mixers/edit.tsx";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

function App() {
    return (
        <BrowserRouter>
            <RefineKbarProvider>
                <ConfigProvider>
                    <AntdApp>
                        <Refine
                            dataProvider={dataProvider(API_URL)}
                            notificationProvider={useNotificationProvider}
                            routerProvider={routerProvider}
                            resources={[
                                {
                                    name: 'devices',
                                    list: '/devices',
                                    create: '/devices/create',
                                    meta: {
                                        icon: <UsbOutlined />
                                    }
                                },
                                {
                                    name: 'camilladsp/pipelines',
                                    list: '/camilladsp/pipelines',
                                    create: '/camilladsp/pipelines/create',
                                    meta: {
                                        label: 'Pipelines',
                                        icon: <PartitionOutlined />
                                    },
                                },
                                {
                                    name: 'camilladsp/mixers',
                                    list: '/camilladsp/mixers',
                                    create: '/camilladsp/mixers/create',
                                    edit: '/camilladsp/mixers/edit/:id',
                                    meta: {
                                        label: 'Mixers',
                                        icon: <NodeExpandOutlined />
                                    },
                                },
                            ]}
                            options={{
                                syncWithLocation: true,
                                warnWhenUnsavedChanges: true,
                                title: {text: 'open-cinema', icon: <img src="/logo.svg" alt="logo" style={{ width: 24 }} />}
                            }}
                        >
                            <Routes>
                                <Route
                                    element={
                                        <ThemedLayout>
                                            <Outlet/>
                                        </ThemedLayout>
                                    }
                                >
                                    <Route index element={<NavigateToResource resource="devices"/>}/>
                                    <Route path="/devices" >
                                        <Route index element={<DeviceList/>}/>
                                        <Route path="create" element={<DeviceCreate/>}/>
                                    </Route>
                                    <Route path="/camilladsp/pipelines">
                                        <Route index element={<PipelineList/>}/>
                                        <Route path="create" element={<PipelineCreate/>}/>
                                    </Route>
                                    <Route path="/camilladsp/mixers">
                                        <Route index element={<MixerList/>}/>
                                        <Route path="create" element={<MixerCreate/>}/>
                                        <Route path="edit/:id" element={<MixerEdit/>}/>
                                    </Route>
                                    <Route path="*" element={<ErrorComponent/>}/>
                                </Route>
                            </Routes>
                            <RefineKbar/>
                            <UnsavedChangesNotifier/>
                            <DocumentTitleHandler/>
                        </Refine>
                    </AntdApp>
                </ConfigProvider>
            </RefineKbarProvider>
        </BrowserRouter>
    )
}

export default App
