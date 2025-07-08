import React, { createContext, useContext, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { _BaseComponent } from "./basics.mjs";

// Create a context for the widget system
const WidgetContext = createContext(null);

// Custom hook to access widget state
export function useWidgetState(path) {
  const widgetBridge = useContext(WidgetContext);

  if (!widgetBridge) {
    throw new Error(
      "useWidgetState must be used within a WidgetBridge component",
    );
  }

  const value = widgetBridge.getValue(path);
  const setValue = useCallback(
    (newValue) => {
      widgetBridge.setValue(path, newValue);
    },
    [widgetBridge, path],
  );

  return [value, setValue];
}

// React component that provides the widget context
function WidgetProvider({ widgetBridge, children }) {
  return (
    <WidgetContext.Provider value={widgetBridge}>
      {children}
    </WidgetContext.Provider>
  );
}

// Bridge class that connects React components to the widget system
export class ReactWidgetBridge extends _BaseComponent {
  constructor(widgetBus, ReactComponent) {
    super(widgetBus);

    this.ReactComponent = ReactComponent;
    // Track which paths are accessed to automatically determine dependencies
    this._accessedPaths = new Set();
    this._hasLoggedDependencies = false;

    // Create container element
    this.element = this._domTool.createElement("div", {
      class: "react-widget-bridge",
    });
    this._insertElement(this.element);

    // Create React root
    this._reactRoot = createRoot(this.element);

    // Create widget bridge API
    this._widgetBridge = {
      getValue: this._getValue.bind(this),
      setValue: this._setValue.bind(this),
    };

    // Initial render
    this._renderReactComponent();
  }

  _getValue(path) {
    // Always track paths that are accessed - this builds up our dependency list
    const isNewDependency = !this._accessedPaths.has(path);
    this._accessedPaths.add(path);

    // Log dependencies on first access (for debugging)
    if (isNewDependency && !this._hasLoggedDependencies) {
      setTimeout(() => {
        if (!this._hasLoggedDependencies) {
          console.log(
            `🔗 React Bridge (${this.ReactComponent.name}) auto-detected dependencies: [${Array.from(this._accessedPaths).join(", ")}]`,
          );
          this._hasLoggedDependencies = true;
        }
      }, 100); // Give time for all initial useWidgetState calls
    }

    try {
      return this.getEntry(path).value;
    } catch (error) {
      console.warn(`Failed to get value for path "${path}":`, error);
      return undefined;
    }
  }

  _setValue(path, newValue) {
    this._changeState(() => {
      try {
        this.getEntry(path).value = newValue;
      } catch (error) {
        console.error(`Failed to set value for path "${path}":`, error);
      }
    });
  }

  _renderReactComponent() {
    try {
      this._reactRoot.render(
        <WidgetProvider widgetBridge={this._widgetBridge}>
          <this.ReactComponent />
        </WidgetProvider>,
      );
    } catch (error) {
      console.error("Error rendering React component:", error);
    }
  }

  update(changedMap) {
    // Check if any of our auto-detected dependencies changed
    const dependencies = Array.from(this._accessedPaths);
    const shouldUpdate = dependencies.some((dep) => changedMap.has(dep));

    if (shouldUpdate) {
      this._renderReactComponent();
    }
  }

  // Clean up React root when component is destroyed
  destroy() {
    if (this._reactRoot) {
      this._reactRoot.unmount();
      this._reactRoot = null;
    }
    super.destroy && super.destroy();
  }
}

// Higher-Order Component factory to create a bridged React component
export function createReactBridge(ReactComponent) {
  return class extends ReactWidgetBridge {
    constructor(widgetBus) {
      super(widgetBus, ReactComponent);
    }
  };
}
