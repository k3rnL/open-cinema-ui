import { Refine } from '@refinedev/core'
import { RefineKbar, RefineKbarProvider } from '@refinedev/kbar'
import routerBindings, {
  NavigateToResource,
  UnsavedChangesNotifier,
  DocumentTitleHandler,
} from '@refinedev/react-router-v6'
import dataProvider from '@refinedev/simple-rest'
import { BrowserRouter, Route, Routes, Outlet } from 'react-router-dom'
import { ConfigProvider, App as AntdApp } from 'antd'
import { useNotificationProvider, ThemedLayoutV2, ErrorComponent } from '@refinedev/antd'
import '@refinedev/antd/dist/reset.css'
import DeviceList from "@/pages/devices/list.tsx";
import DeviceCreate from "@/pages/devices/create.tsx";

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
              routerProvider={routerBindings}
              resources={[
                {
                  name: 'devices',
                  list: '/devices',
                  create: '/devices/create',
                },
              ]}
              options={{
                syncWithLocation: true,
                warnWhenUnsavedChanges: true,
              }}
            >
              <Routes>
                <Route
                  element={
                    <ThemedLayoutV2>
                      <Outlet />
                    </ThemedLayoutV2>
                  }
                >
                  <Route index element={<NavigateToResource resource="devices" />} />
                  <Route path="/devices">
                    <Route index element={<DeviceList />} />
                    <Route path="create" element={<DeviceCreate />} />
                  </Route>
                  <Route path="*" element={<ErrorComponent />} />
                </Route>
              </Routes>
              <RefineKbar />
              <UnsavedChangesNotifier />
              <DocumentTitleHandler />
            </Refine>
          </AntdApp>
        </ConfigProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  )
}

export default App
