import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.112.1/build/three.module.js';
import {ColladaLoader} from 'https://cdn.jsdelivr.net/npm/three@0.112.1/examples/jsm/loaders/ColladaLoader.js';
import {FBXLoader} from 'https://cdn.jsdelivr.net/npm/three@0.112.1/examples/jsm/loaders/FBXLoader.js';
import {GLTFLoader} from 'https://cdn.jsdelivr.net/npm/three@0.112.1/examples/jsm/loaders/GLTFLoader.js';
import {GUI} from 'https://cdn.jsdelivr.net/npm/three@0.112.1/examples/jsm/libs/dat.gui.module.js';
import {BufferGeometryUtils} from 'https://cdn.jsdelivr.net/npm/three@0.112.1/examples/jsm/utils/BufferGeometryUtils.js';

import {agent} from './agent.js';
import {controls} from './controls.js';
import {game} from './game.js';
import {math} from './math.js';

import {visibility} from './visibility.js';

import {particles} from './particles.js';
import {blaster} from './blaster.js';


let _APP = null;


var abracadabra = 1.0;


class PlayerEntity {
  constructor(params) {
    this._model = params.model;
    this._params = params;
    this._game = params.game;
    this._fireCooldown = 0.0;
    this._velocity = new THREE.Vector3(0, 0, 0);
    this._direction = new THREE.Vector3(0, 0, -1);


    const x = 2.75;
    const y1 = 1.5;
    const y2 = 0.4;
    const z = 4.0;
    this._offsets = [

        new THREE.Vector3(-x + 1, -6*y2, -6*z ),
        new THREE.Vector3(x - 1, - 6*y2, -6*z ),
    ];

    this._offsetIndex = 0;

    this._visibilityIndex = this._game._visibilityGrid.UpdateItem(
        this._model.uuid, this);
  }

  get Enemy() {
    return false;
  }

  get Velocity() {
    return this._velocity;
  }

  get Direction() {
    return this._direction;
  }

  get Position() {
    return this._model.position;
  }

  get Radius() {
    return 1.0;
  }

  get Health() {
    return this._health;
  }

  get Dead() {
    return (this._health <= 0.0);
  }



  Fire() {
    if (this._fireCooldown > 0.0) {
      return;
    }

    this._fireCooldown = 0.05;

    const p = this._params.game._entities['_blasterSystem'].CreateParticle();
    p.Start = this._offsets[this._offsetIndex].clone();
    p.Start.applyQuaternion(this._model.quaternion);
    p.Start.add(this.Position);
    p.End = p.Start.clone();
    p.Velocity = this.Direction.clone().multiplyScalar(500.0);
    p.Length = 30.0;
    p.Colours = [
        new THREE.Color((Math.random() * (100 - 0) + 0), (Math.random() * (100 - 0) + 0), (Math.random() * (100 - 0) + 0)), new THREE.Color(0.0, 0.0, 0.0)];
    p.Life = 2.0;
    p.TotalLife = 2.0;
    p.Width = 0.25;

    this._offsetIndex = (this._offsetIndex + 1) % this._offsets.length;
  }

  Update(timeInSeconds) {
    if (this.Dead) {
      return;
    }

    this._visibilityIndex = this._game._visibilityGrid.UpdateItem(
        this._model.uuid, this, this._visibilityIndex);
    this._fireCooldown -= timeInSeconds;
    this._burstCooldown = Math.max(this._burstCooldown, 0.0);
    this._direction.copy(this._velocity);
    this._direction.normalize();
    this._direction.applyQuaternion(this._model.quaternion);
  }
}


class ExplodeParticles {
  constructor(game) {
    this._particleSystem = new particles.ParticleSystem(
        game, {texture: "./resources/explosion.png"});
    this._particles = [];
  }

  Splode(origin) {
    for (let i = 0; i < 96; i++) {
      const p = this._particleSystem.CreateParticle();
      p.Position.copy(origin);
      p.Velocity = new THREE.Vector3(
          math.rand_range(-1, 1),
          math.rand_range(-1, 1),
          math.rand_range(-1, 1)
      );
      p.Velocity.normalize();
      p.Velocity.multiplyScalar(50);
      p.TotalLife = 2.0;
      p.Life = p.TotalLife;
      p.Colours = [new THREE.Color(0xFF8010), new THREE.Color(0xFF8010)];
      p.Sizes = [4, 16];
      p.Size = p.Sizes[0];
      this._particles.push(p);
    }
  }

  Update(timeInSeconds) {
    const _V = new THREE.Vector3();

    this._particles = this._particles.filter(p => {
      return p.Alive;
    });
    for (const p of this._particles) {
      p.Life -= timeInSeconds;
      if (p.Life <= 0) {
        p.Alive = false;
      }
      p.Position.add(p.Velocity.clone().multiplyScalar(timeInSeconds));

      _V.copy(p.Velocity);
      _V.multiplyScalar(10.0 * timeInSeconds);
      const velocityLength = p.Velocity.length();

      if (_V.length() > velocityLength) {
        _V.normalize();
        _V.multiplyScalar(velocityLength)
      }

      p.Velocity.sub(_V);
      p.Size = math.lerp(p.Life / p.TotalLife, p.Sizes[0], p.Sizes[1]);
      p.Colour.copy(p.Colours[0]);
      p.Colour.lerp(p.Colours[1], 1.0 - p.Life / p.TotalLife);
      p.Opacity = math.smootherstep(p.Life / p.TotalLife, 0.0, 1.0);
    }
    this._particleSystem.Update();
  }
};


class ProceduralTerrain_Demo extends game.Game {
  constructor() {
    super();
  }

  _OnInitialize() {
    this._CreateGUI();

    this._userCamera = new THREE.Object3D();
    this._userCamera.position.set(4100, 0, 0);

    this._graphics.Camera.position.set(10340, 880, -2130);
    this._graphics.Camera.quaternion.set(-0.032, 0.885, 0.062, 0.46);

    this._score = 0;

    // This is 2D but eh, whatever.
    this._visibilityGrid = new visibility.VisibilityGrid(
      [new THREE.Vector3(-10000, 0, -10000), new THREE.Vector3(10000, 0, 10000)],
      [100, 100]);

    this._entities['_explosionSystem'] = new ExplodeParticles(this);
    this._entities['_blasterSystem'] = new blaster.BlasterSystem(
        {
            game: this,
            texture: "./resources/blaster.jpg",
            visibility: this._visibilityGrid,
        });



    this._library = {};

    let loader = new GLTFLoader();
    loader.setPath('./resources/models/ufo/');
    loader.load('ufo.gltf', (gltf) => {
      const model = gltf.scene.children[0];
      model.scale.setScalar(.01);
      model.position.set(0,-5,-20);


      const group = new THREE.Group();
      group.add(model);

      this._graphics.Scene.add(group);

      this._entities['player'] = new PlayerEntity(
          {model: group, camera: this._graphics.Camera, game: this});

      this._entities['_controls'] = new controls.ShipControls({
        target: this._entities['player'],
        camera: this._graphics.Camera,
        scene: this._graphics.Scene,
        domElement: this._graphics._threejs.domElement,
        gui: this._gui,
        guiParams: this._guiParams,
      });
    });

    loader = new GLTFLoader();
    loader.setPath('./resources/models/tie-fighter-gltf/');
    loader.load('scene.gltf', (obj) => {
      // This is bad, but I only want the mesh and I know this only has 1.
      // This is what you get when you don't have an art pipeline and don't feel like making one.
      obj.scene.traverse((c) => {
        if (c.isMesh) {
          const model = obj.scene.children[0];
          model.scale.setScalar(0.05);
          model.rotateX(Math.PI);

          const mat = new THREE.MeshStandardMaterial({
            map: new THREE.TextureLoader().load(
                './resources/models/tie-fighter-gltf/textures/hullblue_baseColor.png'),
            normalMap: new THREE.TextureLoader().load(
                './resources/models/tie-fighter-gltf/textures/hullblue_normal.png'),
          });

          model.material = mat;

          this._library['tie-fighter'] = model;
        }

        if (this._library['tie-fighter']) {
          this._CreateEnemyShips();
        }
      });
    });

    this._LoadBackground();
  }

  _CreateEnemyShips() {
    const positions = [
      new THREE.Vector3(8000, 0, 0),
      new THREE.Vector3(-7000, 50, -100),
    ];
    const colours = [
      new THREE.Color(4.0, 0.5, 0.5),
      new THREE.Color(0.5, 0.5, 4.0),
    ];

    for (let j = 0; j < 2; j++) {
      const p = positions[j];

      let loader = new GLTFLoader();
      loader.setPath('./');
      loader.load('robocan24.gltf', (gltf) => {
        const model = gltf.scene.children[0];
        model.scale.setScalar(1.0);
        model.rotateZ(Math.PI / .6);
        model.rotateY(Math.PI / .5);
        model.rotateX(Math.PI / .5);

        const can = model;
        can.position.set(p.x - 900, p.y, p.z + 500);
        can.castShadow = true;
        can.receiveShadow = true;
        can.updateWorldMatrix();
        this._graphics.Scene.add(can);
      });

      let loader1 = new GLTFLoader();
      loader1.setPath('./resources/models/objects/');
      loader1.load('stars.gltf', (gltf) => {
        const model = gltf.scene.children[0];
        model.scale.setScalar(2.0);
        model.rotateZ(Math.PI / 1.0);

        const stars = model;
        stars.position.set(p.x, p.y, p.z);
        stars.castShadow = true;
        stars.receiveShadow = true;
        stars.updateWorldMatrix();
        this._graphics.Scene.add(stars);
      });

      let loader2 = new GLTFLoader();
      loader2.setPath('./resources/models/objects/');
      loader2.load('borfusglow2.gltf', (gltf) => {
        const model = gltf.scene.children[0];
        model.scale.setScalar(5.0);
        model.rotateZ(Math.PI / .1);
        model.rotateY(Math.PI / .282);


        const stars = model;
        stars.position.set((p.x) + 1000, p.y + 500, p.z - 12000);
        stars.castShadow = true;
        stars.receiveShadow = true;
        stars.updateWorldMatrix();
        this._graphics.Scene.add(stars);
      });

      let loader3 = new GLTFLoader();
      loader3.setPath('./resources/models/objects/');
      loader3.load('ssgader1.gltf', (gltf) => {
        const model = gltf.scene.children[0];
        model.scale.setScalar(.25);
        model.rotateZ(Math.PI / .1);
        model.rotateY(Math.PI / .282);


        const gader = model;
        gader.position.set((p.x) +2000, p.y  +700, p.z +2500);
        gader.castShadow = true;
        gader.receiveShadow = true;
        gader.updateWorldMatrix();
        this._graphics.Scene.add(gader);
      });

      let loader4 = new GLTFLoader();
      loader4.setPath('./resources/models/objects/');
      loader4.load('txt.gltf', (gltf) => {
        const model = gltf.scene.children[0];
        model.scale.setScalar(50);
        model.rotateZ(Math.PI / 1);
        model.rotateY(Math.PI / .1205);
        model.rotateX(Math.PI / 1);


        const txt = model;
        txt.position.set((p.x) +600, p.y  +500, p.z -370);
        txt.castShadow = true;
        txt.receiveShadow = true;
        txt.updateWorldMatrix();
        this._graphics.Scene.add(txt);
      });


      break;
    }
  }

  EnemyDied() {
    this._score++;
    document.getElementById('scoreText').innerText = this._score;
  }

  _CreateGUI() {

    this._CreateControlGUI();
  }

  _CreateGameGUI() {

  }

  _CreateControlGUI() {
    this._guiParams = {
      general: {
      },
    };
    this._gui = new GUI();
    this._gui.hide();

    const generalRollup = this._gui.addFolder('General');
    this._gui.close();
  }

  _LoadBackground() {
    this._graphics.Scene.background = new THREE.Color(0xFFFFFF);
    const loader = new THREE.CubeTextureLoader();
    const texture = loader.load([


    ]);
    this._graphics._scene.background = texture;
  }

  _OnStep(timeInSeconds) {
  }
}


function _Main() {
  _APP = new ProceduralTerrain_Demo();

}

_Main();
