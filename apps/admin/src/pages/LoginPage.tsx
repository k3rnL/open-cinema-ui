import {useLogin} from '@refinedev/core'
import {ThemedTitle} from '@refinedev/antd'
import {Button, Card, Col, Form, Input, Layout, Row, Typography} from 'antd'

interface LoginFormValues {
  username: string
  password: string
  remember: boolean
}

export function LoginPage() {
  const {mutate: login, isPending} = useLogin<LoginFormValues>()

  return (
    <Layout style={{minHeight: '100dvh'}}>
      <Row justify="center" align="middle" style={{minHeight: '100dvh'}}>
        <Col xs={22} sm={14} md={10} lg={8} xl={6}>
          <div style={{display: 'flex', justifyContent: 'center', marginBottom: 32}}>
            <ThemedTitle collapsed={false}/>
          </div>
          <Card
            title={<Typography.Title level={3}>Sign in to Open Cinema</Typography.Title>}
          >
            <Form<LoginFormValues>
              layout="vertical"
              requiredMark={false}
              initialValues={{remember: false}}
              onFinish={(values) => login(values)}
            >
              <Form.Item
                name="username"
                label="Username"
                rules={[{required: true, message: 'Username is required'}]}
              >
                <Input
                  size="large"
                  autoComplete="username"
                  autoFocus
                  placeholder="admin"
                />
              </Form.Item>
              <Form.Item
                name="password"
                label="Password"
                rules={[{required: true, message: 'Password is required'}]}
              >
                <Input.Password
                  size="large"
                  autoComplete="current-password"
                  placeholder="Password"
                />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  size="large"
                  htmlType="submit"
                  loading={isPending}
                  block
                >
                  Sign in
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>
      </Row>
    </Layout>
  )
}
