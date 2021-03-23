let container;
let camera;
let renderer;
let scene;
let object;

function init(){
  container = document.querySelector('.scene');
  //create scene
  scene = new THREE.Scene();

  const fov = 35;
  const aspect = container.clientWidth / container.clientHeight;
  const near = .001;
  const far = 100000;
// camera setup
  camera = new THREE.PerspectiveCamera(fov,aspect,near,far);

  camera.position.set(-8, 2, 25);

// renderer

renderer = new THREE.WebGlRenderer({antialias:true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);

container.appendChild(renderer.domElement);

  // load model
  let loader = new THREE.GLTFLoader();
  loader.load('./3d/scene.gltf', function(gltf) {
    scene.add(gltf.scene);
    console.log(gltf);
    renderer.render(scene, camera);
  });


}

init();
