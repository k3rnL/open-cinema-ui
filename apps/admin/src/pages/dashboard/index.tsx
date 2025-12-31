import {Col, Row} from "antd";
import {DevicesCard} from "@/components/dashboard/devices-card.tsx";

export const Dashboard = () => {


    return <div>
        <Row>
            <Col><DevicesCard /></Col>
        </Row>
    </div>
}