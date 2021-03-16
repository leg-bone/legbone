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
  camera = mew THREE.PerspectiveCamera(fov,aspect,near,far);

  camera.position.set(-50, 40, 350);

// renderer

renderer = new THREE.WebGlRenderer({antialias:true});
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);

container.appendChild(renderer.domElement);

  // load model
  let loader = new THREE.FBXLoader();
  loader.load('./borfusHTML.fbx', function(fbx)){
    scene.add(fbx.scene);
    renderer.render(scene, camera);
  });


}
