import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { useMetamodel } from "../react-integration.jsx";
import "./react-time-control/react-time-control.css";

// Format time as HH:MM:SS.SSS
// input is in seconds
function formatTime(time) {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = Math.floor(time % 60);
  const milliseconds = Math.floor((time % 1) * 100);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}`;
}

function UIReactTimeControl({ tPath, playingPath, durationPath }) {
  const [{ currentT, playing, duration }, widgetBridge] = useMetamodel([
    [tPath, "currentT"],
    [playingPath, "playing"],
    [durationPath, "duration"],
  ]);
  const togglePlaying = () => {
    widgetBridge.changeState(() => {
      const playing = widgetBridge.getEntry(playingPath);
      playing.value = !playing.value;
    });
  };

  const handleSliderChange = (event) => {
    const newT = parseFloat(event.target.value);
    widgetBridge.changeState(() => {
      const t = widgetBridge.getEntry(tPath);
      t.value = newT;
    });
  };
  return (
    <div className="react-time-control">
      <div className="react-time-control__controls">
        <button
          aria-label={playing.value ? "Pause animation" : "Play animation"}
          className={`react-time-control__button ${playing.value ? "react-time-control__button--playing" : "react-time-control__button--paused"}`}
          onClick={togglePlaying}
          type="button"
        >
          {playing.value ? "⏸ Pause" : "▶ Play"}
        </button>

        <span className="react-time-control__time-display">
          Clock: {formatTime(duration.value * currentT.value)}
        </span>
      </div>

      <div className="react-time-control__slider-container">
        <label
          className="react-time-control__slider-label"
          htmlFor="react-time-control-slider"
        >
          Time Position:
        </label>

        <input
          aria-label="Time position slider"
          className="react-time-control__slider"
          id="react-time-control-slider"
          max="1"
          min="0"
          onChange={handleSliderChange}
          step="0.001"
          type="range"
          value={currentT.value}
        />
      </div>
    </div>
  );
}
UIReactTimeControl.propTypes = {
  durationPath: PropTypes.string.isRequired,
  playingPath: PropTypes.string.isRequired,
  tPath: PropTypes.string.isRequired,
};

export { UIReactTimeControl };
