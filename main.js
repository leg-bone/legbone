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
    this._decceleration = new THREE.Vector3(-0.0005, -0.0001, -5.0);
    this._acceleration = new THREE.Vector3(1, 0.25, 50.0);
    this._velocity = new THREE.Vector3(0, 0, 0);
    this._position = new THREE.Vector3();
    this._autoMoveSpeed = 20.0;
    this._slowMoveSpeed = 10.0;
    this._runSpeed = 40.0;
    this._gravity = -9.8;
    this._isGrounded = false;
    this._raycaster = new THREE.Raycaster();
    this._raycaster.far = 10;
    this._fallThreshold = 1.0;
    this._planeY = 0;
    this._desktopTurnSpeed = 1.0;  // Reduced from 2.0 to 1.0
    this._mobileTurnSpeed = 0.5;   // Reduced from 1.0 to 0.5

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
      this._target.position.y = 10.0; // Set initial height to 100 units
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

    // Cast ray downward from character's position
    const rayStart = this._target.position.clone();
    rayStart.y += 0.1; // Slight offset to avoid self-collision
    const rayEnd = rayStart.clone();
    rayEnd.y -= 1.0; // Ray length

    this._raycaster.set(rayStart, new THREE.Vector3(0, -1, 0));
    const intersects = this._raycaster.intersectObjects(this._params.scene.children, true);

    // Check if we hit something
    if (intersects.length > 0) {
      const distance = intersects[0].distance;
      if (distance < 1.0) {
        this._isGrounded = true;
        this._target.position.y = intersects[0].point.y + 0.1; // Small offset to prevent sinking
        this._velocity.y = 0;
      } else {
        this._isGrounded = false;
        // Check if we're far enough below the plane to trigger fall state
        if (this._target.position.y < this._planeY - this._fallThreshold && 
            this._stateMachine._currentState.Name !== 'fall') {
          this._stateMachine.SetState('fall');
        }
      }
    } else {
      this._isGrounded = false;
      // If no ground detected and we're below threshold, trigger fall state
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
      shift: false,
    };

    // Touch state tracking
    this._touchState = {
      leftTouch: false,
      rightTouch: false,
      swipeStartY: 0,
      swipeStartX: 0,
      swipeThreshold: 50,
      runTimer: 0,
      isRunning: false,
      isInNeutralZone: false
    };

    // Detect if we're on mobile
    this._isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // Keyboard event listeners
    document.addEventListener('keydown', (e) => this._onKeyDown(e), false);
    document.addEventListener('keyup', (e) => this._onKeyUp(e), false);

    // Touch event listeners
    const touchOverlay = document.getElementById('touchOverlay');
    const leftTouch = document.getElementById('leftTouch');
    const rightTouch = document.getElementById('rightTouch');
    const neutralTouch = document.getElementById('neutralTouch');

    // Handle touch start
    touchOverlay.addEventListener('touchstart', (e) => {
      e.preventDefault();
      
      // Record swipe start position
      this._touchState.swipeStartY = e.touches[0].clientY;
      this._touchState.swipeStartX = e.touches[0].clientX;

      // Check which zone was touched
      const touchX = e.touches[0].clientX;
      const screenWidth = window.innerWidth;
      
      if (touchX < screenWidth * 0.3) {
        // Left zone
        this._touchState.leftTouch = true;
        this._keys.left = true;
        this._touchState.isInNeutralZone = false;
      } else if (touchX > screenWidth * 0.7) {
        // Right zone
        this._touchState.rightTouch = true;
        this._keys.right = true;
        this._touchState.isInNeutralZone = false;
      } else {
        // Neutral zone
        this._touchState.isInNeutralZone = true;
      }
    }, { passive: false });

    // Handle touch move
    touchOverlay.addEventListener('touchmove', (e) => {
      e.preventDefault();
      
      if (e.touches.length === 1) {
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - this._touchState.swipeStartY;
        
        // Only process swipes in neutral zone
        if (this._touchState.isInNeutralZone) {
          // Check for swipe down
          if (deltaY > this._touchState.swipeThreshold) {
            this._keys.backward = true;
          }
          // Check for swipe up
          else if (deltaY < -this._touchState.swipeThreshold && !this._touchState.isRunning) {
            this._touchState.isRunning = true;
            this._keys.forward = true;
            this._touchState.runTimer = 5.0; // Start 5 second timer
          }
        }
      }
    }, { passive: false });

    // Handle touch end
    touchOverlay.addEventListener('touchend', (e) => {
      e.preventDefault();
      
      // Reset side touch states
      this._touchState.leftTouch = false;
      this._touchState.rightTouch = false;
      this._touchState.isInNeutralZone = false;
      this._keys.left = false;
      this._keys.right = false;
      this._keys.backward = false;
    }, { passive: false });

    // Update run timer
    setInterval(() => {
      if (this._touchState.isRunning) {
        this._touchState.runTimer -= 0.1;
        if (this._touchState.runTimer <= 0) {
          this._touchState.isRunning = false;
          this._keys.forward = false;
        }
      }
    }, 100);
  }

  _onKeyDown(event) {
    switch (event.keyCode) {
      case 87: // w
        this._keys.forward = true;
        break;
      case 65: // a
        this._keys.left = true;
        break;
      case 83: // s
        this._keys.backward = true;
        break;
      case 68: // d
        this._keys.right = true;
        break;
      case 32: // SPACE
        this._keys.space = true;
        break;
      case 16: // SHIFT
        this._keys.shift = true;
        break;
    }
  }

  _onKeyUp(event) {
    switch(event.keyCode) {
      case 87: // w
        this._keys.forward = false;
        break;
      case 65: // a
        this._keys.left = false;
        break;
      case 83: // s
        this._keys.backward = false;
        break;
      case 68: // d
        this._keys.right = false;
        break;
      case 32: // SPACE
        this._keys.space = false;
        break;
      case 16: // SHIFT
        this._keys.shift = false;
        break;
    }
  }
};


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
    curAction.crossFadeFrom(prevAction, 0.5, true);
      curAction.play();
    }
  }

  _Finished() {
    this._Cleanup();
    if (this._prevState) {
      // Transition back to the previous state with a smooth crossfade
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
    this._setupAudio();
  }

  _setupAudio() {
    this._audio = new Audio();
    this._audio.src = './resources/loop.mp3';
    this._audio.loop = true;
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

    // Initialize path generation
    this._pathSegments = [];
    this._segmentLength = 50;
    this._segmentWidth = 20;
    this._maxSegments = 5;
    this._lastSegmentZ = 0;
    this._shimmerTime = 0;
    this._randomOffset = Math.random() * Math.PI * 2; // Random starting phase

    // Create initial path segment
    this._CreatePathSegment(0);

    this._mixers = [];
    this._previousRAF = null;

    this._LoadAnimatedModel();
    this._RAF();
  }

  _CreatePathSegment(zPosition) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(this._segmentWidth, this._segmentLength, 10, 10),
      new THREE.MeshStandardMaterial({
        color: 0xE9D5FF,  // Changed to a very light blue-purple
        emissive: 0x6B46C1,  // Keeping the blueish-purple glow
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
    plane.rotation.x = -Math.PI / 2;
    plane.position.z = zPosition;
    this._scene.add(plane);
    this._pathSegments.push(plane);
    this._lastSegmentZ = zPosition;
  }

  _UpdatePath() {
    if (!this._controls) return;

    const characterZ = this._controls.Position.z;
    const nextSegmentZ = this._lastSegmentZ + this._segmentLength;

    // Create new segment if character is approaching the end of the current path
    if (characterZ > nextSegmentZ - this._segmentLength * 2) {
      this._CreatePathSegment(nextSegmentZ);
    }

    // Remove old segments that are too far behind
    while (this._pathSegments.length > this._maxSegments) {
      const oldSegment = this._pathSegments.shift();
      this._scene.remove(oldSegment);
    }

    // Update shimmer effect with more subtle variations
    this._shimmerTime += 0.03;
    const randomFactor = Math.sin(this._shimmerTime * 0.5 + this._randomOffset) * 0.1;
    this._pathSegments.forEach(segment => {
      const material = segment.material;
      material.emissiveIntensity = 50.0 + Math.sin(this._shimmerTime + randomFactor) * 0.5; // Reduced shimmer range
      material.metalness = 1.0;
      material.roughness = Math.sin(this._shimmerTime * 2 + randomFactor) * 0.05; // More subtle roughness variation
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

  _OnWindowResize() {
    // Update camera aspect ratio to match window
    this._camera.aspect = window.innerWidth / window.innerHeight;
    this._camera.updateProjectionMatrix();
    
    // Update renderer and composer size
    this._threejs.setSize(window.innerWidth, window.innerHeight);
    this._composer.setSize(window.innerWidth, window.innerHeight);
  }

  _RAF() {
    requestAnimationFrame((t) => {
      if (this._previousRAF === null) {
        this._previousRAF = t;
      }

      this._RAF();

      this._composer.render();  // Use composer instead of threejs renderer
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

    // Ensure audio is playing
    if (this._audio.paused) {
      this._audio.play();
    }

    // Update bloom shimmer with more subtle and random variations
    this._shimmerTime += 0.03; // Slower base speed
    const randomFactor = Math.sin(this._shimmerTime * 0.5 + this._randomOffset) * 0.1; // Small random influence
    this._bloomPass.strength = 0.8 + Math.sin(this._shimmerTime + randomFactor) * 0.1; // Reduced amplitude
    this._bloomPass.radius = 0.3 + Math.sin(this._shimmerTime * 0.3 + randomFactor) * 0.02; // More subtle radius variation

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
