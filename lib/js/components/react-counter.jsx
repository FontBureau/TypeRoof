import React, { useMemo } from 'react';
import { useMetamodel } from './react-integration.jsx';

const CounterDisplay = ({ counterPath }) => {

  const dependencies = useMemo(() => {
            return [[counterPath, 'count']];
        }, [])
      , [{ count }] = useMetamodel(dependencies)
      ;

  return (
    <div>
      <h2>Counter Display</h2>
      <p>{count.value}</p>
    </div>
  );
};

const CounterControls = ({ counterPath }) => {
    const [,widgetBridge] = useMetamodel();
    const increment = () => {
        widgetBridge.changeState(()=>{
            const counter = widgetBridge.getEntry(counterPath);
            counter.value = counter.value + 1;
        });
    };

    const decrement = () => {
        widgetBridge.changeState(()=>{
            const counter = widgetBridge.getEntry(counterPath);
            counter.value = counter.value - 1;
        });
    };

    const reset = () => {
        widgetBridge.changeState(()=>{
            widgetBridge.getEntry(counterPath).value  = 0;
        });
    };

  return (
    <div className="flex justify-center space-x-4">
      <button onClick={increment}>Increment</button>
      <button onClick={decrement}>Decrement</button>
      <button onClick={reset}>Reset</button>
    </div>
  );
};

// The main application component.
const Counter = ({ counterPath }) => {
  return (
    <div>
        <CounterDisplay
          counterPath={counterPath}
        />
        <CounterControls
            counterPath={counterPath}
          />
      </div>
  );
};

export {Counter};
