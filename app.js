//Variables for setup

let container;
let camera;
let renderer;
let scene;
let object;
var controls;

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
  camera.position.set(45, (window.innerWidth * 4)/window.innerHeight, 1, 10000000 );
  camera.position.z = 2000;
  camera.lookAt(0,0,0);




  const ambient = new THREE.AmbientLight(0x404040, 10);
  scene.add(ambient);

  const light = new THREE.DirectionalLight(0xffffff, 100);
  light.position.set(5000, 50, 10000);
  scene.add(light);
  //Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  container.appendChild(renderer.domElement);
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  //Load Model

const texture = new THREE.TextureLoader().load('./3d/textures/bernoSurface_Color.jpg');
const material = new THREE.MeshBasicMaterial({ map : texture });

  let loader = new THREE.GLTFLoader();
  loader.load("./borfustexHTML.gltf", function(gltf) {
    scene.add(gltf.scene);
    object = gltf.scene.children[0];

    animate();
  });
}

function animate() {
  requestAnimationFrame(animate);


//    object.rotation.y += (Math.random() * (.0001 - .05) + .0000001);



  renderer.render(scene, camera);
}

init();

function onWindowResize() {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(container.clientWidth, container.clientHeight);
}

window.addEventListener("resize", onWindowResize);
