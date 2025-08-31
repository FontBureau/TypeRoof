import React from 'react';
import { useMetamodel } from './react-integration.mjs';

const CounterDisplay = ({ widgetBus, counterPath }) => {
  const { count } = useMetamodel(widgetBus, [
      [counterPath, 'count']
  ]);

  return (
    <div>
      <h2>Counter Display</h2>
      <p>{count.value}</p>
    </div>
  );
};

const CounterControls = ({ widgetBus, counterPath }) => {
    const increment = () => {
        widgetBus.changeState(()=>{
            const counter = widgetBus.getEntry(counterPath);
            counter.value = counter.value + 1;
        });
    };

    const decrement = () => {
        widgetBus.changeState(()=>{
            const counter = widgetBus.getEntry(counterPath);
            counter.value = counter.value - 1;
        });
    };

    const reset = () => {
        widgetBus.changeState(()=>{
            widgetBus.getEntry(counterPath).value  = 0;
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
const Counter = ({ widgetBus, counterPath }) => {
  return (
    <div>
        <CounterDisplay
          widgetBus={widgetBus}
          counterPath={counterPath}
          test={234}
        />
        <CounterControls
            widgetBus={widgetBus}
            counterPath={counterPath}
          />
      </div>
  );
};

export {Counter};
