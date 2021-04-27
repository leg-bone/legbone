//Variables for setup

let container;
let camera;
let renderer;
let scene;
let object;

function init() {
  container = document.querySelector(".scene");

  //Create scene
  const scene = new THREE.Scene();

  const fov = 35;
  const aspect = container.clientWidth / container.clientHeight;
  const near = 0.1;
  const far = 10000;

  //Camera setup
  const camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 10000 );
  camera.position.set( 0, 20, 100 );
controls.update();

  camera.position.z = 1008;

  const controls = new OrbitControls( camera, renderer.domElement );

  const ambient = new THREE.AmbientLight(0x404040, 8);
  scene.add(ambient);

  const light = new THREE.DirectionalLight(0xffffff, 8);
  light.position.set(50, 50, 100);
  scene.add(light);
  //Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  container.appendChild(renderer.domElement);

  //Load Model
  let loader = new THREE.GLTFLoader();
  loader.load("./borfustexHTML.gltf", function(gltf) {
    scene.add(gltf.scene);
    object = gltf.scene.children[0];
    animate();
  });
}
controls.update();

function animate() {
  requestAnimationFrame(animate);
  object.rotation.x += (Math.random() * (.002 - .0001) + .05);
    object.rotation.z += (Math.random() * (.002 - .0001) + .05);
    object.rotation.y += (Math.random() * (.002 - .0001) + .05);
    requestAnimationFrame(animate);
    controls.update();
  renderer.render(scene, camera);
}

init();

function onWindowResize() {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(container.clientWidth, container.clientHeight);
}

window.addEventListener("resize", onWindowResize);
