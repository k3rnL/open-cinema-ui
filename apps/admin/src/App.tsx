import {Authenticated, Refine} from '@refinedev/core'
import {RefineKbar, RefineKbarProvider} from '@refinedev/kbar'
import routerProvider, {
  DocumentTitleHandler,
  NavigateToResource,
  UnsavedChangesNotifier,
} from '@refinedev/react-router'
import dataProvider from '@refinedev/simple-rest'
import {BrowserRouter, Outlet, Route, Routes} from 'react-router'
import {App as AntdApp, ConfigProvider} from 'antd'
import {ApiOutlined, CloudServerOutlined, DashboardOutlined, OneToOneOutlined, SoundOutlined, UsbOutlined} from '@ant-design/icons'
import {ErrorComponent, ThemedLayout, useNotificationProvider} from '@refinedev/antd'
import '@refinedev/antd/dist/reset.css'
import {ColorModeContextProvider} from './contexts/color-mode'
import {CamillaDSPProfilesPage} from '@/pages/orchestration/CamillaDSPProfilesPage'
import {DashboardPage} from '@/pages/orchestration/DashboardPage'
import {DeviceDiscoveryPage} from '@/pages/orchestration/DeviceDiscoveryPage'
import {GraphEditorPage} from '@/pages/orchestration/GraphEditorPage'
import {GraphListPage} from '@/pages/orchestration/GraphListPage'
import {EndpointAdaptersPage} from '@/pages/orchestration/EndpointAdaptersPage'
import {SpeakerTestPage} from '@/pages/orchestration/SpeakerTestPage'
import {LoginPage} from '@/pages/LoginPage'
import {authProvider} from './authProvider'

const API_URL = import.meta.env.VITE_API_URL || '/api'

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <RefineKbarProvider>
        <ColorModeContextProvider>
          <ConfigProvider>
            <AntdApp>
              <Refine
                authProvider={authProvider}
                dataProvider={dataProvider(API_URL)}
                notificationProvider={useNotificationProvider}
                routerProvider={routerProvider}
                resources={[
                  {
                    name: 'dashboard',
                    list: '/dashboard',
                    meta: {label: 'Dashboard', icon: <DashboardOutlined/>},
                  },
                  {
                    name: 'devices',
                    list: '/devices',
                    meta: {label: 'Devices', icon: <UsbOutlined/>},
                  },
                  {
                    name: 'endpoint-adapters',
                    list: '/endpoint-adapters',
                    meta: {label: 'Audio adapters', icon: <CloudServerOutlined/>},
                  },
                  {
                    name: 'graphs',
                    list: '/graphs',
                    edit: '/graphs/edit/:id',
                    meta: {label: 'Audio graphs', icon: <ApiOutlined/>},
                  },
                  {
                    name: 'camilladsp-profiles',
                    list: '/camilladsp/profiles',
                    meta: {label: 'CamillaDSP profiles', icon: <OneToOneOutlined/>},
                  },
                  {
                    name: 'speaker-test',
                    list: '/speaker-test',
                    meta: {label: 'Speaker test', icon: <SoundOutlined/>},
                  },
                ]}
                options={{
                  syncWithLocation: true,
                  warnWhenUnsavedChanges: true,
                  title: {
                    text: 'open-cinema',
                    icon: <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="logo" style={{width: 24}}/>,
                  },
                }}
              >
                <Routes>
                  <Route
                    element={(
                      <Authenticated key="protected" redirectOnFail="/login">
                        <ThemedLayout><Outlet/></ThemedLayout>
                      </Authenticated>
                    )}
                  >
                    <Route index element={<NavigateToResource resource="dashboard"/>}/>
                    <Route path="/dashboard" element={<DashboardPage/>}/>
                    <Route path="/devices" element={<DeviceDiscoveryPage/>}/>
                    <Route path="/endpoint-adapters" element={<EndpointAdaptersPage/>}/>
                    <Route path="/graphs" element={<GraphListPage/>}/>
                    <Route path="/graphs/edit/:id" element={<GraphEditorPage/>}/>
                    <Route path="/camilladsp/profiles" element={<CamillaDSPProfilesPage/>}/>
                    <Route path="/speaker-test" element={<SpeakerTestPage/>}/>
                    <Route path="*" element={<ErrorComponent/>}/>
                  </Route>
                  <Route
                    path="/login"
                    element={(
                      <Authenticated key="login" fallback={<LoginPage/>}>
                        <NavigateToResource resource="dashboard"/>
                      </Authenticated>
                    )}
                  />
                </Routes>
                <RefineKbar/>
                <UnsavedChangesNotifier/>
                <DocumentTitleHandler/>
              </Refine>
            </AntdApp>
          </ConfigProvider>
        </ColorModeContextProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  )
}

export default App
