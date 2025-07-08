import { createReactBridge } from "../react-bridge.jsx";
import { UIReactTimeControl } from "./react-time-control.jsx";

const BridgedUIReactTimeControl = createReactBridge(UIReactTimeControl);

export { BridgedUIReactTimeControl as UIReactTimeControl };
