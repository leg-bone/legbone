//Variables for setup

let container;
let camera;
let renderer;
let scene;
let object;

function init() {
  container = document.querySelector(".scene");

  //Create scene
  scene = new THREE.Scene();

  const fov = 35;
  const aspect = container.clientWidth / container.clientHeight;
  const near = 0.1;
  const far = 10000;

  //Camera setup
  camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.position.set(45, (window.innerWidth * 4)/window.innerHeight, 1, 1000 );
  camera.position.z = 1008;

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

function animate() {
  requestAnimationFrame(animate);
  object.rotation.x += (Math.random() * (.009 - .001) + .05);
    object.rotation.z += (Math.random() * (.009 - .001) + .05);
    object.rotation.y += (Math.random() * (.009 - .001) + .05);
  renderer.render(scene, camera);
}

init();

function onWindowResize() {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(container.clientWidth, container.clientHeight);
}

window.addEventListener("resize", onWindowResize);
