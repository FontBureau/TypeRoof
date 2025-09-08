import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { useMetamodel } from "../react-integration.jsx";

function CounterDisplay({ counterPath }) {
  const [{ count }] = useMetamodel([
    [counterPath, "count"]
  ]);

  return (
    <div>
      <h2>Counter Display</h2>

      <p>{count.value}</p>
    </div>
  );
}
CounterDisplay.propTypes = {
  counterPath: PropTypes.string.isRequired,
};

function CounterControls({ counterPath }) {
  const [, widgetBus] = useMetamodel();
  const increment = () => {
    widgetBus.changeState(() => {
      const counter = widgetBus.getEntry(counterPath);
      counter.value = counter.value + 1;
    });
  };

  const decrement = () => {
    widgetBus.changeState(() => {
      const counter = widgetBus.getEntry(counterPath);
      counter.value = counter.value - 1;
    });
  };

  const reset = () => {
    widgetBus.changeState(() => {
      widgetBus.getEntry(counterPath).value = 0;
    });
  };

  return (
    <div className="flex justify-center space-x-4">
      <button onClick={increment} type="button">
        Increment
      </button>

      <button onClick={decrement} type="button">
        Decrement
      </button>

      <button onClick={reset} type="button">
        Reset
      </button>
    </div>
  );
}
CounterControls.propTypes = {
  counterPath: PropTypes.string.isRequired,
};

// The main application component.
function Counter({ counterPath }) {
  return (
    <div>
      <CounterDisplay counterPath={counterPath} />

      <CounterControls counterPath={counterPath} />
    </div>
  );
}
Counter.propTypes = {
  counterPath: PropTypes.string.isRequired,
};

export { Counter };
