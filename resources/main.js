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
    this._jumpSpeed = 80.0;
    this._gravity = -39.2;
    this._isGrounded = false;
    this._raycaster = new THREE.Raycaster();
    this._raycaster.far = 10;
    this._fallThreshold = 1.0;
    this._planeY = 0;
    this._desktopTurnSpeed = 0.5;
    this._mobileTurnSpeed = 0.5;
    this._initialSpawnHeight = 100.0;
    this._hasSpawned = false;
    this._score = 0;
    this._lastZ = 0;
    this._isScoringEnabled = true;
    this._jumpCooldown = 0;
    this._jumpCooldownDuration = 1.5;
    this._autoJumpTimer = 0;
    this._autoJumpDelay = 0.0;
    this._autoJumpTriggered = false;
    this._initialFallStarted = false;
    this._gameStartTime = Date.now();
    this._minHeightDuration = 3.8; // 5 seconds
    this._minHeightAboveCube = 1.0; // 2 units above cube surface

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
          action: action
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

    // Find the starting cube
    const startCube = this._params.scene.children.find(child => 
      child instanceof THREE.Mesh && 
      child.geometry instanceof THREE.BoxGeometry && 
      child.position.y === -499
    );

    // Check if we're in the first 5 seconds
    const currentTime = (Date.now() - this._gameStartTime) / 1000; // Convert to seconds
    if (startCube && currentTime < this._minHeightDuration) {
      const cubeTop = startCube.position.y + (startCube.geometry.parameters.height / 2);
      const minAllowedHeight = cubeTop + this._minHeightAboveCube;
      
      // If character is below minimum height, push them up
      if (this._target.position.y < minAllowedHeight) {
        this._target.position.y = minAllowedHeight;
        this._velocity.y = 0;
        this._isGrounded = true;
        return;
      }
    }

    // Cast multiple rays in a pattern around the character
    const rayStart = this._target.position.clone();
    rayStart.y += 0.1; // Slightly above character's feet
    
    // Create a pattern of ray origins for more reliable collision detection
    const rayOrigins = [
      new THREE.Vector3(0, 0, 0),      // Center
      new THREE.Vector3(1, 0, 1),      // Front right
      new THREE.Vector3(-1, 0, 1),     // Front left
      new THREE.Vector3(1, 0, -1),     // Back right
      new THREE.Vector3(-1, 0, -1),    // Back left
      new THREE.Vector3(0, 0, 1),      // Front
      new THREE.Vector3(0, 0, -1),     // Back
      new THREE.Vector3(1, 0, 0),      // Right
      new THREE.Vector3(-1, 0, 0)      // Left
    ];

    let hitGround = false;
    let minDistance = Infinity;
    let hitPoint = new THREE.Vector3();

    // Check each ray
    for (const offset of rayOrigins) {
      const origin = rayStart.clone().add(offset);
      this._raycaster.set(origin, new THREE.Vector3(0, -1, 0));
      
      const collisionMeshes = this._params.scene.children.filter(obj => 
        obj.type === 'Mesh' && 
        (obj.material.visible === false || 
         obj.geometry instanceof THREE.BoxGeometry || 
         obj.geometry instanceof THREE.PlaneGeometry ||
         obj.userData.isSolid)
      );
      
      const intersects = this._raycaster.intersectObjects(collisionMeshes, true);

      if (intersects.length > 0) {
        hitGround = true;
        if (intersects[0].distance < minDistance) {
          minDistance = intersects[0].distance;
          hitPoint.copy(intersects[0].point);
        }
      }
    }

    if (hitGround) {
      // Add a small buffer to prevent falling through
      const groundBuffer = 0.2;
      
      if (minDistance < 1.0 && this._velocity.y <= 0) {
        this._isGrounded = true;
        this._target.position.y = hitPoint.y + groundBuffer;
        this._velocity.y = 0;
        
        // If this is the first time we've hit ground, mark as spawned
        if (!this._hasSpawned) {
          this._hasSpawned = true;
          this._target.position.y += 0.5; // Small bounce to ensure we're above ground
          this._velocity.y = 2.0; // Small upward velocity for the bounce
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

    // Handle auto-jump during initial fall
    if (!this._hasSpawned && !this._autoJumpTriggered && this._target && this._target.position.y < this._initialSpawnHeight) {
      if (!this._initialFallStarted) {
        this._initialFallStarted = true;
        this._autoJumpTimer = 0;
      }
      
      this._autoJumpTimer += timeInSeconds;
      if (this._autoJumpTimer >= this._autoJumpDelay) {
        this._autoJumpTriggered = true;
        this._input._isJumpRequested = true;
      }
    }

    // Update jump cooldown
    if (this._jumpCooldown > 0) {
      this._jumpCooldown -= timeInSeconds;
    }

    this._stateMachine.Update(timeInSeconds, this._input);

    // Handle jump request - only allow if not in jump state and cooldown is finished
    if (this._input._isJumpRequested && 
        this._stateMachine._currentState.Name !== 'jump' && 
        this._stateMachine._currentState.Name !== 'fall' &&
        this._jumpCooldown <= 0 &&
        (this._stateMachine._currentState.Name !== 'walk' || this._stateMachine._currentState.CanJump)) {
      this._stateMachine.SetState('jump');
      this._input._isJumpRequested = false;
      this._jumpCooldown = this._jumpCooldownDuration;
    }

    // Update scoring state based on current state
    if (this._stateMachine._currentState.Name === 'fall') {
      this._isScoringEnabled = false;
    } else if (!this._isScoringEnabled && this._stateMachine._currentState.Name !== 'fall') {
      this._isScoringEnabled = true;
    }

    // Apply gravity only if not disabled
    if (!this._isGrounded && !this._stateMachine._currentState._gravityDisabled) {
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
      } else if (this._stateMachine._currentState.Name === 'jump') {
        velocity.z = this._jumpSpeed;
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
    this._jumpInputLocked = false;
    this._jumpInputLockDuration = 1500; // 2 seconds in ms
    
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
    if (event.keyCode === 32) { // space
      if (!this._jumpInputLocked) {
        this._keys.space = true;
        this._isJumpRequested = true;
        this._jumpInputLocked = true;
        setTimeout(() => { this._jumpInputLocked = false; }, this._jumpInputLockDuration);
      }
    }
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
    const touchY = event.touches[0].clientY;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    // Left/right movement zones
    if (touchX < screenWidth * 0.3) {
      this._keys.left = true;
      this._keys.right = false;
    } else if (touchX > screenWidth * 0.7) {
      this._keys.left = false;
      this._keys.right = true;
    } else {
      // Center zone actions based on vertical position
      if (touchY < screenHeight * 0.4) {
        // Top 40% - Jump (same as space)
        if (!this._jumpInputLocked) {
          this._keys.space = true;
          this._isJumpRequested = true;
          this._jumpInputLocked = true;
          setTimeout(() => { this._jumpInputLocked = false; }, this._jumpInputLockDuration);
        }
      } else if (touchY < screenHeight * 0.8) {
        // Middle 40% - Sprint
        this._keys.forward = true;
      } else {
        // Bottom 20% - Dance (same as backward)
        this._keys.backward = true;
      }
    }
  }

  _onTouchEnd(event) {
    this._isMobile = true;
    
    // Reset movement keys
    this._keys.left = false;
    this._keys.right = false;
    this._keys.space = false;
    this._keys.backward = false;
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

    // Slow down the master time scale
    mixer.timeScale = 0.5;

    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.reset();  
      curAction.setLoop(THREE.LoopOnce, 1);
      curAction.clampWhenFinished = true;
      curAction.timeScale = 0.2; // Slow down the dance animation
      curAction.crossFadeFrom(prevAction, 0.5, true);
      curAction.play();
    } else {
      curAction.timeScale = 0.2; // Slow down the dance animation
      curAction.play();
    }
  }

  _Finished() {
    this._Cleanup();
    
    // Reset master time scale
    const curAction = this._parent._proxy._animations['dance'].action;
    curAction.getMixer().timeScale = 1.0;
    
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
    this._walkCooldown = 0;
    this._walkCooldownDuration = 0.3;
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

      // Start walk cooldown if coming from jump
      if (prevState.Name === 'jump') {
        this._walkCooldown = this._walkCooldownDuration;
      }
    } else {
      curAction.play();
    }
  }

  Exit() {
  }
  
  Update(timeElapsed, input) {
    // Update walk cooldown
    if (this._walkCooldown > 0) {
      this._walkCooldown -= timeElapsed;
    }

    if (input._keys.forward) {
      this._parent.SetState('run');
      return;
    }
    if (input._keys.backward) {
      this._parent.SetState('dance');
      return;
    }
  }

  get CanJump() {
    return this._walkCooldown <= 0;
  }
};


class RunState extends State {
  constructor(parent) {
    super(parent);
    this._sprintTimer = 0;
    this._sprintDuration = 5.0;
    this._sprintCooldown = 0;
    this._sprintCooldownTime = 1.5;
    this._isSprinting = false;
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
    if (input._isMobile) {
      // Handle sprint timing for mobile
      if (input._keys.forward && !this._isSprinting && this._sprintCooldown <= 0) {
        // Start sprint
        this._isSprinting = true;
        this._sprintTimer = this._sprintDuration;
      }

      if (this._isSprinting) {
        this._sprintTimer -= timeElapsed;
        if (this._sprintTimer <= 0) {
          // End sprint and start cooldown
          this._isSprinting = false;
          this._sprintCooldown = this._sprintCooldownTime;
          input._keys.forward = false; // Reset forward key
          this._parent.SetState('walk');
          return;
        }
      } else if (this._sprintCooldown > 0) {
        this._sprintCooldown -= timeElapsed;
      }

      // If not sprinting and no forward key, go to walk
      if (!this._isSprinting && !input._keys.forward) {
        this._parent.SetState('walk');
        return;
      }
    } else {
      // Desktop behavior
      if (!input._keys.forward) {
        this._parent.SetState('walk');
        return;
      }
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
    const curAction = this._parent._proxy._animations['fall'].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;
      curAction.enabled = true;
      curAction.setLoop(THREE.LoopRepeat, 10);
      curAction.clampWhenFinished = true;
      curAction.crossFadeFrom(prevAction, 0.5, true);
      curAction.play();
    } else {
      curAction.setLoop(THREE.LoopRepeat, 10);
      curAction.clampWhenFinished = true;
      curAction.crossFadeFrom(prevAction, 0.5, true);
      curAction.play();
    }

    // Show BLTNM button
    const bltnmButton = document.getElementById('bltnmButton');
    if (bltnmButton) {
      bltnmButton.style.display = 'block';
    }
  }

  Exit() {
    // Hide BLTNM button
    const bltnmButton = document.getElementById('bltnmButton');
    if (bltnmButton) {
      bltnmButton.style.display = 'none';
    }
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
    this._gravityDisabled = false;
    this._gravityDisableTimer = 0;
    this._gravityDisableDuration = 0.43;
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
    this._gravityDisabled = true;
    this._gravityDisableTimer = this._gravityDisableDuration;
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
    this._gravityDisabled = false;
    
    // Always transition to walk state after jump
    const walkAction = this._parent._proxy._animations['walk'].action;
    const curAction = this._parent._proxy._animations['jump'].action;
    
    walkAction.reset();
    walkAction.setEffectiveTimeScale(1.0);
    walkAction.setEffectiveWeight(1.0);
    walkAction.crossFadeFrom(curAction, 0.2, true);
    walkAction.play();
    
    this._parent.SetState('walk');
  }

  _Cleanup() {
    const action = this._parent._proxy._animations['jump'].action;
    action.getMixer().removeEventListener('finished', this._FinishedCallback);
  }

  Exit() {
    this._Cleanup();
    this._gravityDisabled = false;
  }

  Update(timeElapsed) {
    if (this._gravityDisabled) {
      this._gravityDisableTimer -= timeElapsed;
      if (this._gravityDisableTimer <= 0) {
        this._gravityDisabled = false;
      }
    }
  }
}


class ThirdPersonCamera {
  constructor(params) {
    this._params = params;
    this._camera = params.camera;
    this._currentPosition = new THREE.Vector3();
    this._currentLookat = new THREE.Vector3();
    this._danceRotation = 0;
    this._danceState = 'none'; // none, holding
  }

  _CalculateIdealOffset() {
    const idealOffset = new THREE.Vector3(-15, 16, -30);
    
    // If in dance state, rotate the camera around the character
    if (this._params.target._stateMachine && 
        this._params.target._stateMachine._currentState && 
        this._params.target._stateMachine._currentState.Name === 'dance') {
      // Create a rotation matrix for the dance
      const rotationMatrix = new THREE.Matrix4();
      rotationMatrix.makeRotationY(Math.PI); // Instantly rotate 180 degrees
      idealOffset.applyMatrix4(rotationMatrix);
    }
    
    idealOffset.applyQuaternion(this._params.target.Rotation);
    idealOffset.add(this._params.target.Position);
    return idealOffset;
  }

  _CalculateIdealLookat() {
    const idealLookat = new THREE.Vector3(160, 10, 620);
    
    // If in dance state, rotate the lookat point around the character
    if (this._params.target._stateMachine && 
        this._params.target._stateMachine._currentState && 
        this._params.target._stateMachine._currentState.Name === 'dance') {
      // Create a rotation matrix for the dance
      const rotationMatrix = new THREE.Matrix4();
      rotationMatrix.makeRotationY(Math.PI); // Instantly rotate 180 degrees
      idealLookat.applyMatrix4(rotationMatrix);
    }
    
    idealLookat.applyQuaternion(this._params.target.Rotation);
    idealLookat.add(this._params.target.Position);
    return idealLookat;
  }

  Update(timeElapsed) {
    // Update dance state
    if (this._params.target._stateMachine && 
        this._params.target._stateMachine._currentState && 
        this._params.target._stateMachine._currentState.Name === 'dance') {
      this._danceState = 'holding';
    } else {
      this._danceState = 'none';
    }

    const idealOffset = this._CalculateIdealOffset();
    const idealLookat = this._CalculateIdealLookat();

    // Instantly set position and lookat without lerping
    this._camera.position.copy(idealOffset);
    this._camera.lookAt(idealLookat);
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

    // Create control overlay
    const controlOverlay = document.createElement('div');
    controlOverlay.id = 'controlOverlay';
    controlOverlay.style.position = 'fixed';
    controlOverlay.style.top = '0';
    controlOverlay.style.left = '0';
    controlOverlay.style.width = '100%';
    controlOverlay.style.height = '100%';
    controlOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    controlOverlay.style.display = 'flex';
    controlOverlay.style.flexDirection = 'column';
    controlOverlay.style.alignItems = 'center';
    controlOverlay.style.justifyContent = 'center';
    controlOverlay.style.zIndex = '2000';
    controlOverlay.style.transition = 'opacity 1.5s ease-in-out';
    controlOverlay.style.fontFamily = 'pixel';
    controlOverlay.style.color = 'white';
    document.body.appendChild(controlOverlay);

    // Create desktop controls
    const desktopControls = document.createElement('div');
    desktopControls.id = 'desktopControls';
    desktopControls.style.display = 'none';
    desktopControls.style.textAlign = 'center';
    desktopControls.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
        <div style="display: flex; gap: 5px;">
          <img src="./resources/w.png" style="width: 48px; height: 48px; transition: all 0.2s ease;">
        </div>
        <div style="display: flex; gap: 5px;">
          <img src="./resources/a.png" style="width: 48px; height: 48px; transition: all 0.2s ease;">
          <img src="./resources/s.png" style="width: 48px; height: 48px; transition: all 0.2s ease;">
          <img src="./resources/d.png" style="width: 48px; height: 48px; transition: all 0.2s ease;">
        </div>
        <div style="display: flex; gap: 5px; margin-top: 10px;">
          <img src="./resources/space.png" style="height: 48px; width: auto; transition: all 0.2s ease;">
        </div>
      </div>
    `;
    controlOverlay.appendChild(desktopControls);

    // Create mobile controls
    const mobileControls = document.createElement('div');
    mobileControls.id = 'mobileControls';
    mobileControls.style.display = 'none';
    mobileControls.style.position = 'fixed';
    mobileControls.style.top = '0';
    mobileControls.style.left = '0';
    mobileControls.style.width = '100%';
    mobileControls.style.height = '100%';
    mobileControls.style.pointerEvents = 'none';
    mobileControls.innerHTML = `
      <div style="position: absolute; top: 20%; left: 50%; transform: translate(-50%, -50%);">
        <img src="./resources/jump.png" style="width: 30vw; height: auto; opacity: 0.7; transition: all 0.2s ease;">
      </div>
      <div style="position: absolute; top: 50%; left: 20%; transform: translate(-50%, -50%);">
        <img src="./resources/left.png" style="width: 30vw; height: auto; opacity: 0.7; transition: all 0.2s ease;">
      </div>
      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">
        <img src="./resources/fwd.png" style="width: 30vw; height: auto; opacity: 0.7; transition: all 0.2s ease;">
      </div>
      <div style="position: absolute; top: 50%; left: 80%; transform: translate(-50%, -50%);">
        <img src="./resources/right.png" style="width: 30vw; height: auto; opacity: 0.7; transition: all 0.2s ease;">
      </div>
      <div style="position: absolute; top: 80%; left: 50%; transform: translate(-50%, -50%);">
        <img src="./resources/back.png" style="width: 30vw; height: auto; opacity: 0.7; transition: all 0.2s ease;">
      </div>
    `;
    controlOverlay.appendChild(mobileControls);

    // Add sequential button click animation
    const animateControls = () => {
      const controls = document.querySelectorAll('#desktopControls img, #mobileControls img');
      let currentIndex = 0;

      const animateNext = () => {
        if (currentIndex >= controls.length) {
          currentIndex = 0;
        }

        const control = controls[currentIndex];
        
        // Click animation
        control.style.transform = 'scale(0.9)';
        control.style.opacity = '1';
        
        setTimeout(() => {
          control.style.transform = 'scale(1)';
          control.style.opacity = '0.7';
          
          currentIndex++;
          setTimeout(animateNext, 500); // Wait before animating next control
        }, 200);
      };

      animateNext();
    };

    // Show appropriate controls based on device
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      mobileControls.style.display = 'block';
    } else {
      desktopControls.style.display = 'block';
    }
    animateControls();

    // Automatically fade out after 5 seconds
    setTimeout(() => {
      controlOverlay.style.opacity = '0';
      setTimeout(() => {
        controlOverlay.style.display = 'none';
      }, 1500); // Wait for fade animation to complete
    }, 5000);

    // Create score display
    const scoreDisplay = document.createElement('div');
    scoreDisplay.id = 'scoreDisplay';
    scoreDisplay.className = 'ui-element';
    scoreDisplay.style.position = 'fixed';
    scoreDisplay.style.bottom = '20px';
    scoreDisplay.style.right = '20px';
    scoreDisplay.style.zIndex = '1000';
    scoreDisplay.style.padding = '10px';
    scoreDisplay.style.fontSize = '24px';
    scoreDisplay.style.color = 'white';
    scoreDisplay.style.fontFamily = 'pixel';
    scoreDisplay.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.5)';
    document.body.appendChild(scoreDisplay);

    // Create restart button
    const restartButton = document.createElement('button');
    restartButton.id = 'restartButton';
    restartButton.innerHTML = '<img src="./resources/restart.png" style="width: 24px; height: 24px; vertical-align: middle; margin-right: 5px;"> RESTART';
    restartButton.style.position = 'fixed';
    restartButton.style.bottom = '80px';
    restartButton.style.right = '20px';
    restartButton.style.zIndex = '1000';
    restartButton.style.padding = '10px 20px';
    restartButton.style.fontSize = '20px';
    restartButton.style.border = 'none';
    restartButton.style.borderRadius = '0px';
    restartButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    restartButton.style.cursor = 'pointer';
    restartButton.style.color = 'white';
    restartButton.style.fontFamily = 'pixel';
    restartButton.style.display = 'none'; // Initially hidden
    restartButton.style.transition = 'all 0.3s ease';
    restartButton.style.boxShadow = 'none';
    restartButton.addEventListener('mouseover', () => {
      restartButton.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
      restartButton.style.boxShadow = '0 0 15px rgba(255, 255, 255, 0.3)';
    });
    restartButton.addEventListener('mouseout', () => {
      restartButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
      restartButton.style.boxShadow = 'none';
    });
    restartButton.addEventListener('click', () => {
      window.location.reload();
    });
    document.body.appendChild(restartButton);

    // Create mute button
    const muteButton = document.createElement('button');
    muteButton.id = 'muteButton';
    muteButton.innerHTML = '🔇'; // Always start muted
    muteButton.style.position = 'fixed';
    muteButton.style.top = '20px';
    muteButton.style.right = '20px';
    muteButton.style.zIndex = '1000';
    muteButton.style.padding = '10px';
    muteButton.style.fontSize = '20px';
    muteButton.style.border = 'none';
    muteButton.style.borderRadius = '0%';
    muteButton.style.backgroundColor = 'rgba(255, 255, 255, 0)';
    muteButton.style.cursor = 'pointer';
    muteButton.style.color = 'white';
    document.body.appendChild(muteButton);

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

    // Prevent default touch behavior on the touch overlay
    const touchOverlay = document.getElementById('touchOverlay');
    if (touchOverlay) {
      touchOverlay.addEventListener('touchstart', (e) => {
        e.preventDefault();
      }, { passive: false });
      touchOverlay.addEventListener('touchmove', (e) => {
        e.preventDefault();
      }, { passive: false });
      touchOverlay.addEventListener('touchend', (e) => {
        e.preventDefault();
      }, { passive: false });
    }

    window.addEventListener('resize', () => {
      this._OnWindowResize();
    }, false);

    const fov = 60;
    const near = 1.0;
    const far = 1000.0;
    this._camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, near, far);
    this._camera.position.set(15, 10, 25);

    this._scene = new THREE.Scene();

    // Initialize audio after camera is created
    const listener = new THREE.AudioListener();
    this._camera.add(listener);

    // Create background music
    const backgroundMusic = new THREE.Audio(listener);
    const audioLoader = new THREE.AudioLoader();
    let audioStarted = false;

    // Function to start audio
    const startAudio = () => {
      if (!audioStarted) {
        audioLoader.load('./resources/loop.mp3', (buffer) => {
          backgroundMusic.setBuffer(buffer);
          backgroundMusic.setLoop(true);
          backgroundMusic.setVolume(0.65);
          backgroundMusic.play();
          audioStarted = true;
        });
      }
    };

    // Start audio on first user interaction
    const startAudioOnInteraction = () => {
      startAudio();
      document.removeEventListener('touchstart', startAudioOnInteraction);
      document.removeEventListener('click', startAudioOnInteraction);
    };

    // Add event listeners for both touch and click
    document.addEventListener('touchstart', startAudioOnInteraction);
    document.addEventListener('click', startAudioOnInteraction);

    // Add mute button functionality
    let isMuted = true; // Always start muted
    muteButton.addEventListener('click', () => {
      isMuted = !isMuted;
      muteButton.innerHTML = isMuted ? '🔇' : '🔊';
      if (backgroundMusic.isPlaying) {
        backgroundMusic.setVolume(isMuted ? 0 : 0.65);
      }
    });

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
    startCube.userData.isSolid = true; // Mark as solid for collision detection
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
    this._maxSegments = 20;
    this._headPos = new THREE.Vector3(0, 0, 60); // Start at front of cube
    this._direction = 'z'; // 'z' = forward, 'x+' = right, 'x-' = left
    this._shimmerTime = 0;
    this._randomOffset = Math.random() * Math.PI * 2;
    this._pathCount = 1; // Start with the initial segment

    // Create initial path segment
    this._CreatePathSegment(this._headPos.clone());

    this._mixers = [];
    this._previousRAF = null;

    // Add elapsed time tracking
    this._startTime = Date.now();
    this._elapsedTime = 0;
    this._isFalling = false;
    this._timeStarted = false;
    this._timeStartDelay = 6060; // 7 seconds in milliseconds

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

      // Ensure we don't create path segments behind the cube
      if (newPos.z >= 0) {
        this._direction = newDir;
        this._headPos = newPos;
        this._CreatePathSegment(newPos);
        this._pathCount++;
      }
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

    // Update elapsed time only if not falling and time has started
    if (!this._isFalling) {
      const currentTime = Date.now();
      if (!this._timeStarted && currentTime - this._startTime >= this._timeStartDelay) {
        this._timeStarted = true;
        this._startTime = currentTime; // Reset start time when we begin counting
      }
      if (this._timeStarted) {
        this._elapsedTime = (currentTime - this._startTime) / 100; // Convert to tenths of seconds
      }
    }

    if (this._controls) {
      this._controls.Update(timeElapsedS);
      this._UpdatePath();
      
      // Check if character is in fall state
      if (this._controls._stateMachine && 
          this._controls._stateMachine._currentState && 
          this._controls._stateMachine._currentState.Name === 'fall') {
        this._isFalling = true;
      }
      
      // Update score display with current path count plus elapsed time
      const scoreDisplay = document.getElementById('scoreDisplay');
      const restartButton = document.getElementById('restartButton');
      if (scoreDisplay) {
        if (this._pathCount > 6 && !this._isFalling) {
          const baseCount = (this._pathCount - 6) * 100;
          const timeCount = this._timeStarted ? Math.floor(this._elapsedTime) : 0;
          scoreDisplay.textContent = `${baseCount + timeCount}`;
          restartButton.style.display = 'none';
        } else if (this._isFalling) {
          // Keep showing the last score when falling
          const baseCount = (this._pathCount - 6) * 100;
          const timeCount = this._timeStarted ? Math.floor(this._elapsedTime) : 0;
          scoreDisplay.textContent = `${baseCount + timeCount}`;
          restartButton.style.display = 'block';
        } else {
          scoreDisplay.textContent = '';
          restartButton.style.display = 'none';
        }
      }
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