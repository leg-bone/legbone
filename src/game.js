import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.112.1/build/three.module.js';
import {WEBGL} from 'https://cdn.jsdelivr.net/npm/three@0.112.1/examples/jsm/WebGL.js';
import {graphics} from './graphics.js';


export const game = (function() {
  return {
    Game: class {
      constructor() {
        this._Initialize();
      }

      _Initialize() {
        this._graphics = new graphics.Graphics(this);
        if (!this._graphics.Initialize()) {
          this._DisplayError('WebGL2 is not available.');
          return;
        }

        this._previousRAF = null;
        this._minFrameTime = 1.0 / 10.0;
        this._entities = {};

        this._OnInitialize();
        this._RAF();
      }

      _DisplayError(errorText) {
        const error = document.getElementById('error');
        error.innerText = errorText;
      }

      _RAF() {
        requestAnimationFrame((t) => {
          if (this._previousRAF === null) {
            this._previousRAF = t;
          }
          this._Render(t - this._previousRAF);
          this._previousRAF = t;
        });
      }

      _StepEntities(timeInSeconds) {
        for (let k in this._entities) {
          this._entities[k].Update(timeInSeconds);
        }
      }

      _Render(timeInMS) {
        const timeInSeconds = Math.min(timeInMS * 0.001, this._minFrameTime);

        this._StepEntities(timeInSeconds);
        this._OnStep(timeInSeconds);
        this._graphics.Render(timeInSeconds);

        this._RAF();

      }
    }
  };
})();
