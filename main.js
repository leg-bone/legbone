import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

import {FBXLoader} from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js';
import {GLTFLoader} from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/GLTFLoader.js';
import {EffectComposer} from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/postprocessing/UnrealBloomPass.js';


class BasicCharacterControllerProxy {
  constructor(animations) {
    this._animations = animations;
  }

  get animations() {
    return this._animations;
  }
};


class BasicCharacterController {
  constructor(params) {
    this._Init(params);
  }

  _Init(params) {
    this._params = params;
    this._decceleration = new THREE.Vector3(-0.001, -0.0002, -10.0);
    this._acceleration = new THREE.Vector3(2, 0.5, 100.0);
    this._velocity = new THREE.Vector3(0, 0, 0);
    this._position = new THREE.Vector3();
    this._autoMoveSpeed = 40.0;
    this._slowMoveSpeed = 20.0;
    this._runSpeed = 60.0;
    this._gravity = -39.2;
    this._isGrounded = false;
    this._raycaster = new THREE.Raycaster();
    this._raycaster.far = 10;
    this._fallThreshold = 1.0;
    this._planeY = 0;
    this._desktopTurnSpeed = 0.5;
    this._mobileTurnSpeed = 0.5;
    this._initialSpawnHeight = 100.0; // Start much higher
    this._hasSpawned = false;
    this._score = 0;
    this._lastZ = 0;
    this._isScoringEnabled = true;

    this._animations = {};
    this._input = new BasicCharacterControllerInput();
    this._stateMachine = new CharacterFSM(
        new BasicCharacterControllerProxy(this._animations));

    this._LoadModels();
  }

  _LoadModels() {
    const loader = new FBXLoader();
    loader.setPath('./resources/zombie/');
    loader.load('mremireh_o_desbiens.fbx', (fbx) => {
      fbx.scale.setScalar(0.1);
      fbx.traverse(c => {
        c.castShadow = true;
      });

      this._target = fbx;
      this._target.position.y = this._initialSpawnHeight;
      this._params.scene.add(this._target);

      this._mixer = new THREE.AnimationMixer(this._target);

      this._manager = new THREE.LoadingManager();
      this._manager.onLoad = () => {
        this._stateMachine.SetState('walk');
      };

      const _OnLoad = (animName, anim) => {
        const clip = anim.animations[0];
        const action = this._mixer.clipAction(clip);
  
        this._animations[animName] = {
          clip: clip,
          action: action,
        };
      };

      const loader = new FBXLoader(this._manager);
      loader.setPath('./resources/zombie/');
      loader.load('walk.fbx', (a) => { _OnLoad('walk', a); });
      loader.load('run.fbx', (a) => { _OnLoad('run', a); });
      loader.load('idle.fbx', (a) => { _OnLoad('idle', a); });
      loader.load('dance.fbx', (a) => { _OnLoad('dance', a); });
      loader.load('fall.fbx', (a) => { _OnLoad('fall', a); });
      loader.load('jump.fbx', (a) => { _OnLoad('jump', a); });
    });
  }

  get Position() {
    return this._position;
  }

  get Rotation() {
    if (!this._target) {
      return new THREE.Quaternion();
    }
    return this._target.quaternion;
  }

  _CheckGroundCollision() {
    if (!this._target) return;

    // Cast multiple rays in a small pattern around the character
    const rayStart = this._target.position.clone();
    rayStart.y += 0.1;
    
    // Create a pattern of ray origins
    const rayOrigins = [
      new THREE.Vector3(0, 0, 0),      // Center
      new THREE.Vector3(1, 0, 1),      // Front right
      new THREE.Vector3(-1, 0, 1),     // Front left
      new THREE.Vector3(1, 0, -1),     // Back right
      new THREE.Vector3(-1, 0, -1)     // Back left
    ];

    let hitGround = false;
    let minDistance = Infinity;

    // Check each ray
    for (const offset of rayOrigins) {
      const origin = rayStart.clone().add(offset);
      this._raycaster.set(origin, new THREE.Vector3(0, -1, 0));
      
      const collisionMeshes = this._params.scene.children.filter(obj => 
        obj.type === 'Mesh' && 
        (obj.material.visible === false || obj.geometry instanceof THREE.BoxGeometry)
      );
      
      const intersects = this._raycaster.intersectObjects(collisionMeshes, true);

      if (intersects.length > 0) {
        hitGround = true;
        minDistance = Math.min(minDistance, intersects[0].distance);
      }
    }

    if (hitGround) {
      if (minDistance < 1.0 && this._velocity.y <= 0) {
        this._isGrounded = true;
        this._target.position.y = rayStart.y - minDistance + 0.1;
        this._velocity.y = 0;
        
        // If this is the first time we've hit ground, mark as spawned
        if (!this._hasSpawned) {
          this._hasSpawned = true;
          this._target.position.y += 1.0; // Small bounce to ensure we're above ground
        }
      } else {
        this._isGrounded = false;
        if (this._target.position.y < this._planeY - this._fallThreshold && 
            this._stateMachine._currentState.Name !== 'fall') {
          this._stateMachine.SetState('fall');
        }
      }
    } else {
      this._isGrounded = false;
      if (this._target.position.y < this._planeY - this._fallThreshold && 
          this._stateMachine._currentState.Name !== 'fall') {
        this._stateMachine.SetState('fall');
      }
    }
  }

  Update(timeInSeconds) {
    if (!this._stateMachine._currentState) {
      return;
    }

    this._stateMachine.Update(timeInSeconds, this._input);

    // Handle jump request
    if (this._input._isJumpRequested && 
        this._stateMachine._currentState.Name !== 'jump' && 
        this._stateMachine._currentState.Name !== 'fall' &&
        !this._stateMachine._currentState._isJumping) {
      this._stateMachine.SetState('jump');
      this._input._isJumpRequested = false;
    }

    // Update scoring state based on current state
    if (this._stateMachine._currentState.Name === 'fall') {
      this._isScoringEnabled = false;
    } else if (!this._isScoringEnabled && this._stateMachine._currentState.Name !== 'fall') {
      this._isScoringEnabled = true;
    }

    // Apply gravity
    if (!this._isGrounded) {
      this._velocity.y += this._gravity * timeInSeconds;
    }

    const velocity = this._velocity;
    const frameDecceleration = new THREE.Vector3(
        velocity.x * this._decceleration.x,
        velocity.y * this._decceleration.y,
        velocity.z * this._decceleration.z
    );
    frameDecceleration.multiplyScalar(timeInSeconds);
    frameDecceleration.z = Math.sign(frameDecceleration.z) * Math.min(
        Math.abs(frameDecceleration.z), Math.abs(velocity.z));

    velocity.add(frameDecceleration);

    const controlObject = this._target;
    const _Q = new THREE.Quaternion();
    const _A = new THREE.Vector3();
    const _R = controlObject.quaternion.clone();

    const acc = this._acceleration.clone();
    if (this._stateMachine._currentState.Name == 'dance') {
      acc.multiplyScalar(0.0);
    }  

    // Only allow movement after we've properly spawned
    if (this._hasSpawned) {
      // Automatic forward movement with speed control
    if (this._input._keys.backward) {
        velocity.z = this._slowMoveSpeed;
      } else if (this._stateMachine._currentState.Name === 'run') {
        velocity.z = this._runSpeed;
      } else {
        velocity.z = this._autoMoveSpeed;
    }

      // Use different turn speeds for desktop and mobile
      const turnSpeed = this._input._isMobile ? this._mobileTurnSpeed : this._desktopTurnSpeed;

    if (this._input._keys.left) {
      _A.set(0, 1, 0);
        _Q.setFromAxisAngle(_A, turnSpeed * Math.PI * timeInSeconds * this._acceleration.y);
      _R.multiply(_Q);
    }
    if (this._input._keys.right) {
      _A.set(0, 1, 0);
        _Q.setFromAxisAngle(_A, turnSpeed * -Math.PI * timeInSeconds * this._acceleration.y);
      _R.multiply(_Q);
      }
    }

    controlObject.quaternion.copy(_R);

    const oldPosition = new THREE.Vector3();
    oldPosition.copy(controlObject.position);

    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyQuaternion(controlObject.quaternion);
    forward.normalize();

    const sideways = new THREE.Vector3(1, 0, 0);
    sideways.applyQuaternion(controlObject.quaternion);
    sideways.normalize();

    sideways.multiplyScalar(velocity.x * timeInSeconds);
    forward.multiplyScalar(velocity.z * timeInSeconds);

    controlObject.position.add(forward);
    controlObject.position.add(sideways);
    controlObject.position.y += velocity.y * timeInSeconds;

    this._CheckGroundCollision();

    this._position.copy(controlObject.position);

    if (this._mixer) {
      this._mixer.update(timeInSeconds);
    }
  }
};

class BasicCharacterControllerInput {
  constructor() {
    this._Init();    
  }

  _Init() {
    this._keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      space: false,
    };
    this._isJumpRequested = false;
    this._isMobile = false;
    this._touchStartX = 0;
    this._touchStartY = 0;
    this._touchEndX = 0;
    this._touchEndY = 0;
    this._touchStartTime = 0;
    this._isSwiping = false;
    this._swipeThreshold = 30; // Minimum distance for a swipe
    this._tapThreshold = 300; // Maximum time for a tap (in milliseconds)
    
    // Initialize neutral zone with actual dimensions
    const neutralTouch = document.getElementById('neutralTouch');
    if (neutralTouch) {
      const rect = neutralTouch.getBoundingClientRect();
      this._neutralZone = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      };
    } else {
      this._neutralZone = { x: 0, y: 0, width: 0, height: 0 };
    }

    // Add keyboard event listeners to document
    document.addEventListener('keydown', (e) => this._onKeyDown(e), false);
    document.addEventListener('keyup', (e) => this._onKeyUp(e), false);

    // Add touch event listeners to touch overlay
    const touchOverlay = document.getElementById('touchOverlay');
    if (touchOverlay) {
      touchOverlay.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: true });
      touchOverlay.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: true });
      touchOverlay.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: true });
    }
  }

  _onKeyDown(event) {
    switch (event.keyCode) {
      case 87: // w
        this._keys.forward = true;
        break;
      case 83: // s
        this._keys.backward = true;
        break;
      case 65: // a
        this._keys.left = true;
        break;
      case 68: // d
        this._keys.right = true;
        break;
      case 32: // space
        this._keys.space = true;
        this._isJumpRequested = true;
        break;
    }
  }

  _onKeyUp(event) {
    switch(event.keyCode) {
      case 87: // w
        this._keys.forward = false;
        break;
      case 83: // s
        this._keys.backward = false;
        break;
      case 65: // a
        this._keys.left = false;
        break;
      case 68: // d
        this._keys.right = false;
        break;
      case 32: // space
        this._keys.space = false;
        break;
    }
  }

  _onTouchStart(event) {
    this._isMobile = true;
    this._touchStartX = event.touches[0].clientX;
    this._touchStartY = event.touches[0].clientY;
    this._touchStartTime = Date.now();
    this._isSwiping = false;

    // Check which side of the screen was touched
    const touchX = event.touches[0].clientX;
    const screenWidth = window.innerWidth;
    
    if (touchX < screenWidth * 0.3) {
      this._keys.left = true;
      this._keys.right = false;
    } else if (touchX > screenWidth * 0.7) {
      this._keys.left = false;
      this._keys.right = true;
    }
  }

  _onTouchEnd(event) {
    this._isMobile = true;
    this._touchEndX = event.changedTouches[0].clientX;
    this._touchEndY = event.changedTouches[0].clientY;
    
    const touchDuration = Date.now() - this._touchStartTime;
    const touchDistance = Math.sqrt(
      Math.pow(this._touchEndX - this._touchStartX, 2) +
      Math.pow(this._touchEndY - this._touchStartY, 2)
    );

    // If it's a short touch with little movement, treat it as a tap
    if (!this._isSwiping && touchDuration < this._tapThreshold && touchDistance < this._swipeThreshold) {
      if (this._isInNeutralZone(this._touchEndX, this._touchEndY)) {
        this._isJumpRequested = true;
      }
    }
    
    // Reset movement keys
    this._keys.left = false;
    this._keys.right = false;
  }

  _onTouchMove(event) {
    this._isMobile = true;
    this._touchEndX = event.touches[0].clientX;
    this._touchEndY = event.touches[0].clientY;

    const touchDistance = Math.sqrt(
      Math.pow(this._touchEndX - this._touchStartX, 2) +
      Math.pow(this._touchEndY - this._touchStartY, 2)
    );

    // If movement exceeds threshold, mark as swiping
    if (touchDistance > this._swipeThreshold) {
      this._isSwiping = true;
    }

    // Update movement based on touch position
    const touchX = event.touches[0].clientX;
    const screenWidth = window.innerWidth;
    
    if (touchX < screenWidth * 0.3) {
      this._keys.left = true;
      this._keys.right = false;
    } else if (touchX > screenWidth * 0.7) {
      this._keys.left = false;
      this._keys.right = true;
    } else {
      this._keys.left = false;
      this._keys.right = false;
    }
  }

  _isInNeutralZone(x, y) {
    return x >= this._neutralZone.x && 
           x <= this._neutralZone.x + this._neutralZone.width &&
           y >= this._neutralZone.y && 
           y <= this._neutralZone.y + this._neutralZone.height;
  }

  Update() {
    // Reset jump request after it's been processed
    this._isJumpRequested = false;
  }
}


class FiniteStateMachine {
  constructor() {
    this._states = {};
    this._currentState = null;
  }

  _AddState(name, type) {
    this._states[name] = type;
  }

  SetState(name) {
    const prevState = this._currentState;
    
    if (prevState) {
      if (prevState.Name == name) {
        return;
      }
      prevState.Exit();
    }

    const state = new this._states[name](this);

    this._currentState = state;
    state.Enter(prevState);
  }

  Update(timeElapsed, input) {
    if (this._currentState) {
      this._currentState.Update(timeElapsed, input);
    }
  }
};


class CharacterFSM extends FiniteStateMachine {
  constructor(proxy) {
    super();
    this._proxy = proxy;
    this._Init();
  }

  _Init() {
    this._AddState('idle', IdleState);
    this._AddState('walk', WalkState);
    this._AddState('run', RunState);
    this._AddState('dance', DanceState);
    this._AddState('fall', FallState);
    this._AddState('jump', JumpState);
  }
};


class State {
  constructor(parent) {
    this._parent = parent;
  }

  Enter() {}
  Exit() {}
  Update() {}
};


class DanceState extends State {
  constructor(parent) {
    super(parent);

    this._FinishedCallback = () => {
      this._Finished();
    }
  }

  get Name() {
    return 'dance';
  }

  Enter(prevState) {
    this._prevState = prevState;  // Store the previous state
    const curAction = this._parent._proxy._animations['dance'].action;
    const mixer = curAction.getMixer();
    mixer.addEventListener('finished', this._FinishedCallback);

    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.reset();  
      curAction.setLoop(THREE.LoopOnce, 1);
      curAction.clampWhenFinished = true;
      curAction.crossFadeFrom(prevAction, 0.5, true);
      curAction.play();
    } else {
      curAction.play();
    }
  }

  _Finished() {
    this._Cleanup();
    
    // If previous state was jump or dance, go to idle instead
    if (this._prevState && (this._prevState.Name === 'jump' || this._prevState.Name === 'dance')) {
      const idleAction = this._parent._proxy._animations['idle'].action;
      const curAction = this._parent._proxy._animations['dance'].action;
      
      idleAction.reset();
      idleAction.setEffectiveTimeScale(1.0);
      idleAction.setEffectiveWeight(1.0);
      idleAction.crossFadeFrom(curAction, 0.5, true);
      idleAction.play();
      
      this._parent.SetState('idle');
    } else if (this._prevState) {
      // Normal transition back to previous state
      const prevAction = this._parent._proxy._animations[this._prevState.Name].action;
      const curAction = this._parent._proxy._animations['dance'].action;
      
      prevAction.reset();
      prevAction.setEffectiveTimeScale(1.0);
      prevAction.setEffectiveWeight(1.0);
      prevAction.crossFadeFrom(curAction, 0.5, true);
      prevAction.play();
      
      this._parent.SetState(this._prevState.Name);
    } else {
      this._parent.SetState('idle');
    }
  }

  _Cleanup() {
    const action = this._parent._proxy._animations['dance'].action;
    action.getMixer().removeEventListener('finished', this._FinishedCallback);
  }

  Exit() {
    this._Cleanup();
  }

  Update(_) {
  }
};


class WalkState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return 'walk';
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations['walk'].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;
      curAction.enabled = true;

      if (prevState.Name == 'run') {
        const ratio = curAction.getClip().duration / prevAction.getClip().duration;
        curAction.time = prevAction.time * ratio;
      } else {
        curAction.time = 0.0;
        curAction.setEffectiveTimeScale(1.0);
        curAction.setEffectiveWeight(1.0);
      }
      
      curAction.crossFadeFrom(prevAction, 0.5, true);
      curAction.play();
    } else {
  
      curAction.play();
    }
  }

  Exit() {
  }
  
  Update(timeElapsed, input) {
    if (input._keys.forward) {
      this._parent.SetState('run');
      return;
    }
    if (input._keys.backward) {
      this._parent.SetState('dance');
      return;
    }
  }
};


class RunState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return 'run';
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations['run'].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.enabled = true;

      if (prevState.Name == 'walk') {
        const ratio = curAction.getClip().duration / prevAction.getClip().duration;
        curAction.time = prevAction.time * ratio;
      } else {
        curAction.time = 0.0;
        curAction.setEffectiveTimeScale(1.0);
        curAction.setEffectiveWeight(1.0);
      }

      curAction.crossFadeFrom(prevAction, 1.0, true);
      curAction.play();
    } else {
      curAction.play();
    }
  }

  Exit() {
  }

  Update(timeElapsed, input) {
    if (!input._keys.forward) {
      this._parent.SetState('walk');
      return;
    }
    if (input._keys.backward) {
      this._parent.SetState('dance');
      return;
    }
  }
};


class IdleState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return 'idle';
  }

  Enter(prevState) {
    const idleAction = this._parent._proxy._animations['idle'].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;
      idleAction.time = 0.0;
      idleAction.enabled = true;
      idleAction.setEffectiveTimeScale(1.0);
      idleAction.setEffectiveWeight(1.0);
      idleAction.crossFadeFrom(prevAction, 0.5, true);
      idleAction.play();
    } else {
      idleAction.play();
    }
  }

  Exit() {
  }

  Update(_, input) {
    if (input._keys.forward) {
      this._parent.SetState('run');
    } else if (input._keys.backward) {
      this._parent.SetState('dance');
    }
  }
};


class FallState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return 'fall';
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations['fall'].action; // Using dance as placeholder
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;
      curAction.enabled = true;
      curAction.setLoop(THREE.LoopRepeat, 10); // Play once and stop
      curAction.clampWhenFinished = true;
      curAction.crossFadeFrom(prevAction, 0.5, true);
      curAction.play();
    } else {
      curAction.setLoop(THREE.LoopRepeat, 10);
      curAction.clampWhenFinished = true;
      curAction.crossFadeFrom(prevAction, 0.5, true);
      curAction.play();
    }
  }

  Exit() {
  }

  Update(_, input) {
    // Check if we're back on ground
    if (this._parent._proxy._isGrounded) {
      this._parent.SetState('walk');
    }
  }
}


class JumpState extends State {
  constructor(parent) {
    super(parent);
    this._isJumping = false;
    this._FinishedCallback = () => {
      this._Finished();
    }
  }

  get Name() {
    return 'jump';
  }

  Enter(prevState) {
    this._prevState = prevState;  // Store the previous state
    this._isJumping = true;
    const curAction = this._parent._proxy._animations['jump'].action;
    const mixer = curAction.getMixer();
    mixer.addEventListener('finished', this._FinishedCallback);

    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.reset();  
      curAction.setLoop(THREE.LoopOnce, 1);
      curAction.clampWhenFinished = true;
      curAction.crossFadeFrom(prevAction, 0.2, true);
      curAction.play();
    } else {
      curAction.play();
    }
  }

  _Finished() {
    this._Cleanup();
    this._isJumping = false;
    
    // If previous state was jump or dance, go to idle instead
    if (this._prevState && (this._prevState.Name === 'jump' || this._prevState.Name === 'dance')) {
      const idleAction = this._parent._proxy._animations['idle'].action;
      const curAction = this._parent._proxy._animations['jump'].action;
      
      idleAction.reset();
      idleAction.setEffectiveTimeScale(1.0);
      idleAction.setEffectiveWeight(1.0);
      idleAction.crossFadeFrom(curAction, 0.2, true);
      idleAction.play();
      
      this._parent.SetState('idle');
    } else if (this._prevState) {
      // Normal transition back to previous state
      const prevAction = this._parent._proxy._animations[this._prevState.Name].action;
      const curAction = this._parent._proxy._animations['jump'].action;
      
      prevAction.reset();
      prevAction.setEffectiveTimeScale(1.0);
      prevAction.setEffectiveWeight(1.0);
      prevAction.crossFadeFrom(curAction, 0.2, true);
      prevAction.play();
      
      this._parent.SetState(this._prevState.Name);
    } else {
      this._parent.SetState('idle');
    }
  }

  _Cleanup() {
    const action = this._parent._proxy._animations['jump'].action;
    action.getMixer().removeEventListener('finished', this._FinishedCallback);
  }

  Exit() {
    this._Cleanup();
  }

  Update(_) {
  }
};


class ThirdPersonCamera {
  constructor(params) {
    this._params = params;
    this._camera = params.camera;

    this._currentPosition = new THREE.Vector3();
    this._currentLookat = new THREE.Vector3();
  }

  _CalculateIdealOffset() {
    const idealOffset = new THREE.Vector3(-15, 16, -30);
    idealOffset.applyQuaternion(this._params.target.Rotation);
    idealOffset.add(this._params.target.Position);
    return idealOffset;
  }

  _CalculateIdealLookat() {
    const idealLookat = new THREE.Vector3(160, 10, 620);
    idealLookat.applyQuaternion(this._params.target.Rotation);
    idealLookat.add(this._params.target.Position);
    return idealLookat;
  }

  Update(timeElapsed) {
    const idealOffset = this._CalculateIdealOffset();
    const idealLookat = this._CalculateIdealLookat();

    // const t = 0.05;
    // const t = 4.0 * timeElapsed;
    const t = 1.0 - Math.pow(0.001, timeElapsed);

    this._currentPosition.lerp(idealOffset, t);
    this._currentLookat.lerp(idealLookat, t);

    this._camera.position.copy(this._currentPosition);
    this._camera.lookAt(this._currentLookat);
  }
}


class ThirdPersonCameraDemo {
  constructor() {
    this._Initialize();
  }

  _Initialize() {
    this._threejs = new THREE.WebGLRenderer({
      antialias: true,
    });
    this._threejs.outputEncoding = THREE.sRGBEncoding;
    this._threejs.shadowMap.enabled = true;
    this._threejs.shadowMap.type = THREE.PCFSoftShadowMap;
    this._threejs.setPixelRatio(window.devicePixelRatio);
    this._threejs.setSize(window.innerWidth, window.innerHeight);

    document.body.appendChild(this._threejs.domElement);

    // Prevent default touch behavior on the canvas
    this._threejs.domElement.addEventListener('touchstart', (e) => {
      e.preventDefault();
    }, { passive: false });
    this._threejs.domElement.addEventListener('touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });
    this._threejs.domElement.addEventListener('touchend', (e) => {
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('resize', () => {
      this._OnWindowResize();
    }, false);

    const fov = 60;
    const near = 1.0;
    const far = 1000.0;
    this._camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, near, far);
    this._camera.position.set(15, 10, 25);

    this._scene = new THREE.Scene();

    // Setup bloom effect
    this._composer = new EffectComposer(this._threejs);
    const renderPass = new RenderPass(this._scene, this._camera);
    this._composer.addPass(renderPass);

    this._bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.8,    // strength
      0.3,    // radius
      0.9     // threshold
    );
    this._composer.addPass(this._bloomPass);

    let light = new THREE.DirectionalLight(0xFFFFFF, 1.0);
    light.position.set(-100, 100, 100);
    light.target.position.set(0, 0, 0);
    light.castShadow = true;
    light.shadow.bias = -0.001;
    light.shadow.mapSize.width = 4096;
    light.shadow.mapSize.height = 4096;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 500.0;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 500.0;
    light.shadow.camera.left = 50;
    light.shadow.camera.right = -50;
    light.shadow.camera.top = 50;
    light.shadow.camera.bottom = -50;
    this._scene.add(light);

    light = new THREE.AmbientLight(0xFFFFFF, 0.25);
    this._scene.add(light);

    // Add permanent starting cube
    const startCube = new THREE.Mesh(
      new THREE.BoxGeometry(120, 1000, 120),
      new THREE.MeshStandardMaterial({
        color: 0x18191A,
        emissive: 0x18191A,
        emissiveIntensity: 1.0,
        metalness: 1.0,
        roughness: 0.0,
        transparent: false,
        toneMapped: false,
        clearcoat: 1.0,
        clearcoatRoughness: 0.0
      })
    );
    startCube.position.set(0, -499, 60); // Position it below the starting point
    startCube.castShadow = true;
    startCube.receiveShadow = true;
    this._scene.add(startCube);

    const loader = new THREE.CubeTextureLoader();
    const texture = loader.load([
        './resources/posx.jpg',
        './resources/negx.jpg',
        './resources/posy.jpg',
        './resources/negy.jpg',
        './resources/posz.jpg',
        './resources/negz.jpg',
    ]);
    texture.encoding = THREE.sRGBEncoding;
    this._scene.background = texture;

    // Path generation state
    this._pathSegments = [];
    this._segmentLength = 50;
    this._segmentWidth = 10;
    this._maxSegments = 10;
    this._headPos = new THREE.Vector3(0, 0, 0); // Start at origin
    this._direction = 'z'; // 'z' = forward, 'x+' = right, 'x-' = left
    this._shimmerTime = 0;
    this._randomOffset = Math.random() * Math.PI * 2;
    this._pathCount = 1; // Start with the initial segment

    // Create initial path segment
    this._CreatePathSegment(this._headPos.clone());

    this._mixers = [];
    this._previousRAF = null;

    this._LoadAnimatedModel();
    this._RAF();
  }

  _CreatePathSegment(position) {
    // Visible mesh
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(this._segmentWidth, this._segmentLength, 10, 10),
        new THREE.MeshStandardMaterial({
        color: 0x6B46C1,
        emissive: 0x6B46C1,
        emissiveIntensity: 50.0,
        metalness: 1.0,
        roughness: 0.0,
        transparent: false,
        toneMapped: false,
        clearcoat: 1.0,
        clearcoatRoughness: 0.0
      })
    );
    plane.castShadow = false;
    plane.receiveShadow = true;
    plane.rotation.x = -Math.PI / 2; // Always parallel to XZ plane
    plane.rotation.y = 0;
    plane.rotation.z = 0;
    plane.position.copy(position);
    this._scene.add(plane);

    // Collision buffer (invisible, slightly wider)
    const bufferWidth = this._segmentWidth * 1.05;
    const collisionPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(bufferWidth, this._segmentLength, 2, 2),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    collisionPlane.rotation.x = -Math.PI / 2;
    collisionPlane.position.copy(position);
    this._scene.add(collisionPlane);

    this._pathSegments.push({mesh: plane, collision: collisionPlane, pos: position.clone(), dir: this._direction});
  }

  _UpdatePath() {
    if (!this._controls) return;

    const characterPos = this._controls.Position;
    // Distance from character to head of path
    const distToHead = characterPos.distanceTo(this._headPos);

    // If close to the end, add a new segment
    if (distToHead < this._segmentLength * 2) {
      // Decide turn: 0 = straight, -1 = left, 1 = right
      let turn = 0;
      if (this._pathCount > 7) {
        const rand = Math.random();
        if (rand < 0.3) turn = -1; // 30% left
        else if (rand > 0.7) turn = 1; // 30% right
        // else 40% straight
      }

      // Compute new direction
      let newDir = this._direction;
      if (turn === -1) {
        if (this._direction === 'z') newDir = 'x-';
        else if (this._direction === 'x+') newDir = 'z';
        else if (this._direction === 'x-') newDir = 'z';
      } else if (turn === 1) {
        if (this._direction === 'z') newDir = 'x+';
        else if (this._direction === 'x+') newDir = 'z';
        else if (this._direction === 'x-') newDir = 'z';
      }
      // else keep going straight

      // Compute new position
      let newPos = this._headPos.clone();
      if (newDir === this._direction) {
        // Going straight
        if (newDir === 'z') {
          newPos.z += this._segmentLength;
        } else if (newDir === 'x+') {
          newPos.x += this._segmentWidth;
        } else if (newDir === 'x-') {
          newPos.x -= this._segmentWidth;
        }
      } else {
        // Turning: offset by half width and half length to keep path continuous
        if (this._direction === 'z' && newDir === 'x+') {
          newPos.x += this._segmentWidth / 2;
          newPos.z += this._segmentLength / 2;
        } else if (this._direction === 'z' && newDir === 'x-') {
          newPos.x -= this._segmentWidth / 2;
          newPos.z += this._segmentLength / 2;
        } else if (this._direction === 'x+' && newDir === 'z') {
          newPos.x += this._segmentWidth / 2;
          newPos.z += this._segmentLength / 2;
        } else if (this._direction === 'x-' && newDir === 'z') {
          newPos.x -= this._segmentWidth / 2;
          newPos.z += this._segmentLength / 2;
        }
      }
      this._direction = newDir;
      this._headPos = newPos;
      this._CreatePathSegment(newPos);
      this._pathCount++;
    }

    // Remove old segments that are too far behind
    while (this._pathSegments.length > this._maxSegments) {
      const old = this._pathSegments.shift();
      this._scene.remove(old.mesh);
    }

    // Shimmer effect
    this._shimmerTime += 0.03;
    const randomFactor = Math.sin(this._shimmerTime * 0.5 + this._randomOffset) * 0.1;
    this._pathSegments.forEach(seg => {
      const material = seg.mesh.material;
      material.emissiveIntensity = 50.0 + Math.sin(this._shimmerTime + randomFactor) * 0.5;
      material.metalness = 1.0;
      material.roughness = Math.sin(this._shimmerTime * 2 + randomFactor) * 0.05;
    });
  }

  _LoadAnimatedModel() {
    const params = {
      camera: this._camera,
      scene: this._scene,
    }
    this._controls = new BasicCharacterController(params);
    
    // Set the plane's y position after controls are created
    const plane = this._scene.children.find(child => child instanceof THREE.Mesh && child.geometry instanceof THREE.PlaneGeometry);
    if (plane) {
      this._controls._planeY = plane.position.y;
    }

    this._thirdPersonCamera = new ThirdPersonCamera({
      camera: this._camera,
      target: this._controls,
    });
  }

  _RAF() {
    requestAnimationFrame((t) => {
      if (this._previousRAF === null) {
        this._previousRAF = t;
      }

      this._RAF();

      this._composer.render();
      this._Step(t - this._previousRAF);
      this._previousRAF = t;
    });
  }

  _Step(timeElapsed) {
    const timeElapsedS = timeElapsed * 0.001;
    if (this._mixers) {
      this._mixers.map(m => m.update(timeElapsedS));
    }

    if (this._controls) {
      this._controls.Update(timeElapsedS);
      this._UpdatePath();
    }

    // Update bloom shimmer with more subtle and random variations
    this._shimmerTime += 0.03;
    const randomFactor = Math.sin(this._shimmerTime * 0.5 + this._randomOffset) * 0.1;
    this._bloomPass.strength = 0.8 + Math.sin(this._shimmerTime + randomFactor) * 0.1;
    this._bloomPass.radius = 0.3 + Math.sin(this._shimmerTime * 0.3 + randomFactor) * 0.02;

    this._thirdPersonCamera.Update(timeElapsedS);
  }
}


let _APP = null;

window.addEventListener('DOMContentLoaded', () => {
  _APP = new ThirdPersonCameraDemo();
});


function _LerpOverFrames(frames, t) {
  const s = new THREE.Vector3(0, 0, 0);
  const e = new THREE.Vector3(100, 0, 0);
  const c = s.clone();

  for (let i = 0; i < frames; i++) {
    c.lerp(e, t);
  }
  return c;
}

function _TestLerp(t1, t2) {
  const v1 = _LerpOverFrames(100, t1);
  const v2 = _LerpOverFrames(50, t2);
  console.log(v1.x + ' | ' + v2.x);
}

_TestLerp(0.01, 0.01);
_TestLerp(1.0 / 100.0, 1.0 / 50.0);
_TestLerp(1.0 - Math.pow(0.3, 1.0 / 100.0), 
          1.0 - Math.pow(0.3, 1.0 / 50.0));
