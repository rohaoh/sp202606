(async () => {
  const THREE = await import('./node_modules/three/build/three.module.js');

  const selPreset    = document.getElementById('sel-preset');
  const selShape     = document.getElementById('sel-shape');
  const selTarget    = document.getElementById('sel-target');
  const inpMass      = document.getElementById('inp-mass');
  const inpArea      = document.getElementById('inp-area');
  const inpCd        = document.getElementById('inp-cd');
  const inpHeight    = document.getElementById('inp-height');
  const inpV0        = document.getElementById('inp-v0');
  const inpG         = document.getElementById('inp-g');
  const inpWindX     = document.getElementById('inp-wind-x');
  const inpWindZ     = document.getElementById('inp-wind-z');
  const windHint     = document.getElementById('wind-hint');
  const windArrowCvs = document.getElementById('wind-arrow-canvas');
  const inpTemp      = document.getElementById('inp-temp');
  const inpHumidity  = document.getElementById('inp-humidity');
  const atmRhoHint   = document.getElementById('atm-rho-hint');
  const tvLive       = document.getElementById('tv-live');
  const btnRun       = document.getElementById('btn-run');
  const btnPlay      = document.getElementById('btn-play');
  const btnStop      = document.getElementById('btn-stop');
  const btnReset     = document.getElementById('btn-reset');
  const btnTraj      = document.getElementById('btn-traj');
  const btnCompare   = document.getElementById('btn-compare');
  const cmpBadge     = document.getElementById('cmp-badge');
  const btnExportPng = document.getElementById('btn-export-png');
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnSaveJson  = document.getElementById('btn-save-json');
  const btnLoadJson  = document.getElementById('btn-load-json');
  const fileJson     = document.getElementById('file-json');
  const tDisp        = document.getElementById('t-disp');
  const hBar         = document.getElementById('h-bar');
  const btnStl       = document.getElementById('btn-stl');
  const fileStl      = document.getElementById('file-stl');
  const mVt          = document.getElementById('m-vt');
  const mVi          = document.getElementById('m-vi');
  const mFt          = document.getElementById('m-ft');
  const mTt          = document.getElementById('m-tt');
  const destrFill    = document.getElementById('destr-fill');
  const destrLevel   = document.getElementById('destr-level');
  const chartPh      = document.getElementById('chart-ph');
  const graphCanvas  = document.getElementById('graph-canvas');
  const graphLegend  = document.getElementById('graph-legend');
  const canvasWrap   = document.getElementById('canvas-wrap');
  const liveOverlay  = document.getElementById('live-overlay');
  const atmBadge     = document.getElementById('atm-badge');
  const ovT          = document.getElementById('ov-t');
  const ovH          = document.getElementById('ov-h');
  const ovV          = document.getElementById('ov-v');
  const ovRho        = document.getElementById('ov-rho');
  const ovAtm        = document.getElementById('ov-atm');
  const ovDriftRow   = document.getElementById('ov-drift-row');
  const ovPx         = document.getElementById('ov-px');
  const ovPz         = document.getElementById('ov-pz');
  const matTooltip   = document.getElementById('mat-tooltip');
  const ttName       = document.getElementById('tt-name');
  const ttYs         = document.getElementById('tt-ys');
  const ttTh         = document.getElementById('tt-th');
  const ttFm         = document.getElementById('tt-fm');
  const tblPlaceholder = document.getElementById('tbl-placeholder');
  const dataTable      = document.getElementById('data-table');
  const tblBody        = document.getElementById('tbl-body');
  const tblInfo        = document.getElementById('tbl-info');

  const ATM_COLOR = {
    'Troposphere':        '#58a6ff',
    'Lower Stratosphere': '#a371f7',
    'Upper Stratosphere': '#c084fc',
    'Stratopause':        '#f0a500',
    'Mesosphere':         '#f85149',
    'Near Vacuum':        '#6e7681',
  };

  let activeTab      = 'velocity';
  let simResult      = null;
  let compareResult  = null;
  let showTraj       = false;
  let trajLine       = null;
  let craterGroup    = null;
  let playing        = false;
  let playHead       = 0;
  let impacted       = false;
  let targetObjects  = [];
  let fallingPresets = [];
  let fragmentMeshes = [];
  let jsFragments    = [];
  let dustParticles  = null;
  let fracturing     = false;
  let lastFrameTime  = 0;
  let graphAccum     = 0;
  let highlightAccum = 0;
  let needsRender    = true;
  let currentH0      = 500;
  let currentG       = 9.81;

  function requestRender(){ needsRender = true; }

  const SHAPE_CD = { sphere:0.47, cylinder:0.82, box:1.05, cone:0.50 };

  if (window.physics) {
    fallingPresets = await window.physics.getFallingObjects();
    fallingPresets.forEach((p,i)=>{
      const opt=document.createElement('option');
      opt.value=i; opt.textContent=`${p.name}  (${p.mass} kg)`;
      selPreset.appendChild(opt);
    });
    targetObjects = await window.physics.getTargetObjects();
    targetObjects.forEach((t,i)=>{
      const opt=document.createElement('option');
      opt.value=i; opt.textContent=t.name;
      selTarget.appendChild(opt);
    });
  }

  const PRESET_SHAPES=['sphere','sphere','box','sphere','box','box','sphere'];
  function lockInputs(locked){
    [inpMass,inpArea,inpCd].forEach(el=>locked?el.setAttribute('readonly',true):el.removeAttribute('readonly'));
  }
  selPreset.addEventListener('change',()=>{
    const idx=parseInt(selPreset.value);
    if(idx<0){lockInputs(false);return;}
    const p=fallingPresets[idx];
    inpMass.value=p.mass; inpArea.value=p.area; inpCd.value=p.cd;
    selShape.value=PRESET_SHAPES[idx]||'sphere';
    lockInputs(true); updateTV(); rebuildFallingMesh();
  });
  selShape.addEventListener('change',()=>{
    if(parseInt(selPreset.value)<0){inpCd.value=SHAPE_CD[selShape.value];updateTV();}
    rebuildFallingMesh();
  });

  // [F8] ISA air density with humidity correction (Magnus formula)
  function airDensityJS(alt, tempOffset=0, humidity=50){
    if(alt<0)alt=0;
    const R=287.05, grav=9.80665, L0=0.0065;
    const T0=288.15+tempOffset, P0=101325;
    let T, P;
    if(alt<=11000){
      T=T0-L0*alt; P=P0*Math.pow(T/T0,grav/(R*L0));
    } else {
      const T11=T0-L0*11000;
      const P11=P0*Math.pow(T11/T0,grav/(R*L0));
      if(alt<=20000){
        T=T11; P=P11*Math.exp(-grav*(alt-11000)/(R*T11));
      } else {
        const P20=P11*Math.exp(-grav*9000/(R*T11));
        if(alt<=32000){
          const L2=0.001; T=T11+L2*(alt-20000);
          P=P20*Math.pow(T/T11,-grav/(R*L2));
        } else if(alt<=80000){
          return airDensityJS(32000,tempOffset,0)*Math.exp(-0.0001*(alt-32000));
        } else { return 1e-5; }
      }
    }
    let rho=P/(R*T);
    if(humidity>0&&alt<20000){
      const Tc=T-273.15;
      const es=611.2*Math.exp(17.67*Tc/(Tc+243.04));
      const e=(humidity/100)*es;
      rho*=(1-0.378*e/P);
    }
    return Math.max(rho,1e-5);
  }

  function atmNameJS(alt){
    if(alt<11000) return 'Troposphere';
    if(alt<20000) return 'Lower Stratosphere';
    if(alt<32000) return 'Upper Stratosphere';
    if(alt<50000) return 'Stratopause';
    if(alt<80000) return 'Mesosphere';
    return 'Near Vacuum';
  }

  // [F8] Atmosphere hint update
  function updateAtmHint(){
    const rho=airDensityJS(0,+inpTemp.value||0,+inpHumidity.value||50);
    atmRhoHint.textContent=`Sea-level ρ = ${rho.toFixed(4)} kg/m³`;
    updateTV();
  }
  [inpTemp,inpHumidity].forEach(el=>el.addEventListener('input',updateAtmHint));
  updateAtmHint();

  // [F1] Wind arrow canvas
  function drawWindArrow(){
    const wx=+inpWindX.value||0, wz=+inpWindZ.value||0;
    const speed=Math.hypot(wx,wz);
    const ctx=windArrowCvs.getContext('2d');
    const W=windArrowCvs.width, H=windArrowCvs.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#161b22'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='#21262d'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(W/2,H/2,W/2-2,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle='#6e7681'; ctx.font='8px Consolas'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('N',W/2,6); ctx.fillText('S',W/2,H-6);
    ctx.fillText('E',W-6,H/2); ctx.fillText('W',6,H/2);
    if(speed<0.01){ ctx.fillText('—',W/2,H/2); return; }
    const angle=Math.atan2(wx,-wz);
    const len=Math.min(speed*2,W/2-10);
    const cx=W/2,cy=H/2;
    const ex=cx+Math.sin(angle)*len, ey=cy-Math.cos(angle)*len;
    ctx.strokeStyle='#58a6ff'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(ex,ey); ctx.stroke();
    const sa=Math.sin(angle),ca=Math.cos(angle),hw=3,hl=7;
    ctx.fillStyle='#58a6ff'; ctx.beginPath();
    ctx.moveTo(ex,ey);
    ctx.lineTo(ex-sa*hl-ca*hw,ey+ca*hl-sa*hw);
    ctx.lineTo(ex-sa*hl+ca*hw,ey+ca*hl+sa*hw);
    ctx.closePath(); ctx.fill();
  }
  function updateWindHint(){
    const wx=+inpWindX.value||0, wz=+inpWindZ.value||0;
    const speed=Math.hypot(wx,wz);
    if(speed<0.01){ windHint.textContent='No wind'; drawWindArrow(); return; }
    const deg=((Math.atan2(wx,-wz)*180/Math.PI)+360)%360;
    windHint.textContent=`${speed.toFixed(1)} m/s  ·  ${deg.toFixed(0)}° (from N)`;
    drawWindArrow();
  }
  [inpWindX,inpWindZ].forEach(el=>el.addEventListener('input',updateWindHint));
  updateWindHint();

  function updateTV(){
    const m=+inpMass.value,A=+inpArea.value,Cd=+inpCd.value,g=+inpG.value;
    const rho=airDensityJS(0,+inpTemp.value||0,+inpHumidity.value||50);
    tvLive.textContent=(m&&A&&Cd&&g)?Math.sqrt((2*m*g)/(rho*Cd*A)).toFixed(3):'—';
  }
  [inpMass,inpArea,inpCd,inpG].forEach(el=>el.addEventListener('input',updateTV));
  updateTV();
  btnStl.addEventListener('click',()=>fileStl.click());
  fileStl.addEventListener('change',()=>{if(fileStl.files[0])btnStl.textContent=fileStl.files[0].name;});

  // [F1][F8] Local simulation with wind and atmosphere
  function localSimulate(){
    const m=+inpMass.value,A=+inpArea.value,Cd=+inpCd.value;
    const h0=+inpHeight.value,v0=+inpV0.value,g=+inpG.value;
    const wx=+inpWindX.value||0, wz=+inpWindZ.value||0;
    const tempOff=+inpTemp.value||0, hum=+inpHumidity.value||50;
    const dt=0.05;
    let vy=-v0,vx=0,vz=0,h=h0,posX=0,posZ=0,t=0;
    const frames=[]; let ttReached=null;
    const rhoSea=airDensityJS(0,tempOff,hum);
    const vtSea=Math.sqrt((2*m*g)/(rhoSea*Cd*A));
    while(h>0&&t<7200){
      const rho=airDensityJS(h,tempOff,hum);
      const drag_y=0.5*rho*Cd*A*vy*vy;
      const sign_vy=vy>=0?1:-1;
      const ay=(m*g-sign_vy*drag_y)/m;
      const vRelX=vx-wx, vRelZ=vz-wz;
      const ax=-(0.5*rho*Cd*A*vRelX*Math.abs(vRelX))/m;
      const az=-(0.5*rho*Cd*A*vRelZ*Math.abs(vRelZ))/m;
      const vtLocal=rho>1e-10?Math.sqrt((2*m*g)/(rho*Cd*A)):1e9;
      frames.push({t,v:vy,h,a:ay,rho,atm:atmNameJS(h),px:posX,pz:posZ});
      if(!ttReached&&Math.abs(vy)>=vtLocal*0.99)ttReached=t;
      vy+=ay*dt; h-=vy*dt;
      vx+=ax*dt; posX+=vx*dt;
      vz+=az*dt; posZ+=vz*dt;
      t=Math.round((t+dt)*1000)/1000;
    }
    const last=frames[frames.length-1];
    return{frames,terminalVelocity:vtSea,impactVelocity:Math.abs(last.v),fallTime:last.t,timeToTerminal:ttReached??last.t,driftX:last.px,driftZ:last.pz};
  }

  // --- Three.js scene ---
  const scene     = new THREE.Scene();
  const camera    = new THREE.PerspectiveCamera(50,1,0.1,200000);
  const renderer3 = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer3.setPixelRatio(Math.min(window.devicePixelRatio,1.75));
  renderer3.shadowMap.enabled=true;
  renderer3.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer3.shadowMap.autoUpdate=false;
  canvasWrap.appendChild(renderer3.domElement);

  const skyMat=new THREE.ShaderMaterial({
    side:THREE.BackSide,
    uniforms:{altitudeFrac:{value:0.0}},
    vertexShader:`varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec3 vPos;uniform float altitudeFrac;void main(){float t=clamp(vPos.y/80000.0,0.0,1.0);vec3 lo=vec3(0.40,0.65,0.95),hi=vec3(0.05,0.10,0.30),sp=vec3(0.01,0.01,0.05);vec3 c=mix(mix(lo,hi,t),sp,altitudeFrac*0.9);gl_FragColor=vec4(c,1.0);}`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(80000,32,16),skyMat));

  const sunLight=new THREE.DirectionalLight(0xfff5e0,1.4);
  sunLight.position.set(200,500,100); sunLight.castShadow=true;
  sunLight.shadow.mapSize.set(1024,1024);
  sunLight.shadow.camera.near=0.5; sunLight.shadow.camera.far=2000;
  sunLight.shadow.camera.left=-200; sunLight.shadow.camera.right=200;
  sunLight.shadow.camera.top=200; sunLight.shadow.camera.bottom=-200;
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x9bbfff,0.5));
  const fill=new THREE.DirectionalLight(0x7eb3ff,0.3);
  fill.position.set(-100,50,-100); scene.add(fill);

  const cloudGroup=new THREE.Group();
  for(let i=0;i<10;i++){
    const geo=new THREE.SphereGeometry(50+Math.random()*70,7,4);
    const mat=new THREE.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:0.5+Math.random()*0.2,roughness:1,metalness:0});
    const c=new THREE.Mesh(geo,mat);
    c.position.set((Math.random()-0.5)*3000,800+Math.random()*1200,(Math.random()-0.5)*3000);
    c.scale.set(1+Math.random(),0.35+Math.random()*0.25,1+Math.random());
    cloudGroup.add(c);
  }
  scene.add(cloudGroup);

  const groundMesh=new THREE.Mesh(
    new THREE.PlaneGeometry(2000,2000,1,1),
    new THREE.MeshStandardMaterial({color:0x3a5c2e,roughness:0.95,metalness:0})
  );
  groundMesh.rotation.x=-Math.PI/2; groundMesh.position.y=-0.01;
  groundMesh.receiveShadow=true; scene.add(groundMesh);
  const grid=new THREE.GridHelper(300,30,0x1a3a10,0x1a3a10);
  grid.position.y=0.01; scene.add(grid);

  let orbitTarget=new THREE.Vector3(0,2,0);
  let orbitRadius=40,orbitTheta=0.6,orbitPhi=1.1;
  let isDragging=false,isPanning=false,lastMouse={x:0,y:0};
  function updateCamera(){
    camera.position.set(
      orbitTarget.x+orbitRadius*Math.sin(orbitPhi)*Math.sin(orbitTheta),
      orbitTarget.y+orbitRadius*Math.cos(orbitPhi),
      orbitTarget.z+orbitRadius*Math.sin(orbitPhi)*Math.cos(orbitTheta)
    );
    camera.lookAt(orbitTarget);
  }
  updateCamera();
  renderer3.domElement.addEventListener('mousedown',e=>{
    if(e.button===0)isDragging=true; if(e.button===2)isPanning=true;
    lastMouse={x:e.clientX,y:e.clientY};
  });
  renderer3.domElement.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('mouseup',()=>{isDragging=false;isPanning=false;});
  window.addEventListener('mousemove',e=>{
    if(!isDragging&&!isPanning)return;
    const dx=e.clientX-lastMouse.x,dy=e.clientY-lastMouse.y;
    lastMouse={x:e.clientX,y:e.clientY};
    if(isDragging){orbitTheta-=dx*0.008;orbitPhi=Math.max(0.05,Math.min(Math.PI*0.48,orbitPhi+dy*0.008));updateCamera();requestRender();}
    if(isPanning){
      const r=new THREE.Vector3();
      r.crossVectors(camera.getWorldDirection(new THREE.Vector3()),new THREE.Vector3(0,1,0)).normalize();
      orbitTarget.addScaledVector(r,-dx*0.08); orbitTarget.y+=dy*0.08; updateCamera(); requestRender();
    }
  });
  renderer3.domElement.addEventListener('wheel',e=>{
    orbitRadius=Math.max(5,Math.min(2000,orbitRadius+e.deltaY*0.1)); updateCamera(); requestRender();
  });
  function resize3(){
    const w=canvasWrap.clientWidth,h=canvasWrap.clientHeight;
    renderer3.setSize(w,h,false);
    camera.aspect=w/h; camera.updateProjectionMatrix(); requestRender();
  }
  resize3();
  new ResizeObserver(resize3).observe(canvasWrap);

  let fallingMesh=null;
  const FALL_MATS={
    sphere:  new THREE.MeshStandardMaterial({color:0x3b82f6,roughness:0.3,metalness:0.4}),
    cylinder:new THREE.MeshStandardMaterial({color:0x22c55e,roughness:0.4,metalness:0.2}),
    box:     new THREE.MeshStandardMaterial({color:0xf59e0b,roughness:0.5,metalness:0.1}),
    cone:    new THREE.MeshStandardMaterial({color:0xef4444,roughness:0.4,metalness:0.2}),
  };
  function rebuildFallingMesh(){
    if(fallingMesh){scene.remove(fallingMesh);fallingMesh.geometry.dispose();fallingMesh=null;}
    let geo;
    switch(selShape.value){
      case 'sphere':   geo=new THREE.SphereGeometry(1,24,24);break;
      case 'cylinder': geo=new THREE.CylinderGeometry(0.7,0.7,1.8,24);break;
      case 'box':      geo=new THREE.BoxGeometry(1.4,1.4,1.4);break;
      case 'cone':     geo=new THREE.ConeGeometry(1,2,24);break;
      default:         geo=new THREE.SphereGeometry(1,24,24);
    }
    fallingMesh=new THREE.Mesh(geo,FALL_MATS[selShape.value]);
    fallingMesh.castShadow=true; scene.add(fallingMesh); requestRender();
  }
  rebuildFallingMesh();

  let targetMesh=null;
  const TARGET_CFG={
    wood:    {color:0x8b5e3c,roughness:0.9,metalness:0.0,geo:()=>new THREE.BoxGeometry(20,0.6,20)},
    concrete:{color:0x6b7280,roughness:1.0,metalness:0.0,geo:()=>new THREE.BoxGeometry(28,1.2,28)},
    steel:   {color:0xb0b8c4,roughness:0.15,metalness:0.95,geo:()=>new THREE.BoxGeometry(22,0.25,22)},
    glass:   {color:0x93c5fd,roughness:0.05,metalness:0.1,transparent:true,opacity:0.4,geo:()=>new THREE.BoxGeometry(20,0.18,20)},
    brick:   {color:0xa0522d,roughness:0.95,metalness:0.0,geo:()=>new THREE.BoxGeometry(18,4,8)},
  };
  function rebuildTargetMesh(){
    if(targetMesh){scene.remove(targetMesh);targetMesh.geometry.dispose();targetMesh.material.dispose();targetMesh=null;}
    const t=targetObjects[+selTarget.value]; if(!t)return;
    const cfg=TARGET_CFG[t.material]||TARGET_CFG.concrete;
    targetMesh=new THREE.Mesh(cfg.geo(),new THREE.MeshStandardMaterial({
      color:cfg.color,roughness:cfg.roughness,metalness:cfg.metalness,
      transparent:cfg.transparent||false,opacity:cfg.opacity||1.0,
    }));
    targetMesh.position.y=0; targetMesh.receiveShadow=true; scene.add(targetMesh); requestRender();
  }
  rebuildTargetMesh();
  selTarget.addEventListener('change',rebuildTargetMesh);

  // [F6] Material tooltip
  selTarget.addEventListener('mousemove',e=>{
    const t=targetObjects[+selTarget.value]; if(!t)return;
    ttName.textContent=t.name;
    ttYs.textContent=`${t.yieldStrength.toFixed(0)} Pa`;
    ttTh.textContent=`${t.thickness.toFixed(3)} m`;
    ttFm.textContent=t.fractureMode||'—';
    matTooltip.style.display='block';
    const tw=matTooltip.offsetWidth,th=matTooltip.offsetHeight;
    matTooltip.style.left=(e.clientX+tw+12>window.innerWidth?e.clientX-tw-6:e.clientX+12)+'px';
    matTooltip.style.top =(e.clientY+th+6>window.innerHeight?e.clientY-th-6:e.clientY+6)+'px';
  });
  selTarget.addEventListener('mouseleave',()=>{matTooltip.style.display='none';});

  // [F2] Crater
  function createCrater(radius){
    if(craterGroup){scene.remove(craterGroup);craterGroup.children.forEach(m=>{m.geometry.dispose();m.material.dispose();});craterGroup=null;}
    craterGroup=new THREE.Group();
    const r=Math.max(0.5,radius)*2.5;
    const floor=new THREE.Mesh(
      new THREE.CircleGeometry(r,32),
      new THREE.MeshStandardMaterial({color:0x1a1a1a,roughness:1,metalness:0})
    );
    floor.rotation.x=-Math.PI/2; floor.position.y=0.02; craterGroup.add(floor);
    const rim=new THREE.Mesh(
      new THREE.TorusGeometry(r,r*0.18,8,32),
      new THREE.MeshStandardMaterial({color:0x4a4040,roughness:0.9,metalness:0})
    );
    rim.rotation.x=-Math.PI/2; rim.position.y=0.05; craterGroup.add(rim);
    scene.add(craterGroup); requestRender();
  }

  // [F5] Trajectory line
  function buildTrajLine(result){
    if(trajLine){scene.remove(trajLine);trajLine.geometry.dispose();trajLine.material.dispose();trajLine=null;}
    if(!result||!result.frames)return;
    const frames=result.frames;
    const visualH=Math.min(currentH0,1500);
    const positions=new Float32Array(frames.length*3);
    for(let i=0;i<frames.length;i++){
      const f=frames[i];
      const pct=Math.max(0,Math.min(1,f.h/currentH0));
      const driftScale=0.05;
      positions[i*3]  =(f.px||0)*driftScale;
      positions[i*3+1]=pct*visualH;
      positions[i*3+2]=(f.pz||0)*driftScale;
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
    trajLine=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0x58a6ff,transparent:true,opacity:0.6}));
    if(showTraj)scene.add(trajLine);
    requestRender();
  }

  function clearFragments(){
    fragmentMeshes.forEach(m=>{scene.remove(m);m.geometry.dispose();m.material.dispose();});
    fragmentMeshes=[]; jsFragments=[];
    if(dustParticles){scene.remove(dustParticles);dustParticles.geometry.dispose();dustParticles.material.dispose();dustParticles=null;}
    fracturing=false;
  }

  function spawnFragments(fractureData,targetMaterial){
    clearFragments();
    if(!fractureData||fractureData.mode==='none')return;
    const cfg=TARGET_CFG[targetMaterial]||TARGET_CFG.concrete;
    if(fractureData.mode==='deform'&&targetMesh){
      const pos=targetMesh.geometry.attributes.position;
      fractureData.deformations.forEach(d=>{
        if(d.index<pos.count){
          pos.setX(d.index,pos.getX(d.index)+d.dx);
          pos.setY(d.index,pos.getY(d.index)+d.dy);
          pos.setZ(d.index,pos.getZ(d.index)+d.dz);
        }
      });
      pos.needsUpdate=true; targetMesh.geometry.computeVertexNormals();
    } else {
      if(targetMesh)targetMesh.visible=false;
      const fragMat=new THREE.MeshStandardMaterial({color:cfg.color,roughness:0.8,metalness:cfg.metalness||0.1,side:THREE.DoubleSide});
      (fractureData.fragments||[]).forEach(f=>{
        const geo=new THREE.BufferGeometry();
        geo.setAttribute('position',new THREE.Float32BufferAttribute(f.vertices,3));
        if(f.indices&&f.indices.length>0)geo.setIndex(new THREE.Uint32BufferAttribute(f.indices,1));
        geo.computeVertexNormals();
        const mesh=new THREE.Mesh(geo,fragMat);
        mesh.position.set(...f.position); mesh.castShadow=true;
        scene.add(mesh); fragmentMeshes.push(mesh);
        jsFragments.push({
          pos:[f.position[0],f.position[1],f.position[2]],
          vel:[(f.velocity&&f.velocity[0])||0,(f.velocity&&f.velocity[1])||0,(f.velocity&&f.velocity[2])||0],
          ang:[(Math.random()-0.5)*8,(Math.random()-0.5)*8,(Math.random()-0.5)*8],
          quat:[0,0,0,1], active:true,
        });
      });
    }
    if(fractureData.dustParticleCount>0){
      const n=Math.min(fractureData.dustParticleCount,300);
      const positions=new Float32Array(n*3), velocities=new Float32Array(n*3);
      for(let i=0;i<n;i++){
        positions[i*3]=(Math.random()-0.5)*10;
        positions[i*3+1]=Math.random()*4;
        positions[i*3+2]=(Math.random()-0.5)*10;
        velocities[i*3]=(Math.random()-0.5)*0.15;
        velocities[i*3+1]=Math.random()*0.12+0.02;
        velocities[i*3+2]=(Math.random()-0.5)*0.15;
      }
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
      dustParticles=new THREE.Points(geo,new THREE.PointsMaterial({color:0xd4b896,size:0.15,transparent:true,opacity:0.9}));
      dustParticles._vel=velocities; scene.add(dustParticles);
    }
    fracturing=true; requestRender();
  }

  function stepFragmentsJS(dt,g){
    let active=0;
    for(let i=0;i<jsFragments.length;i++){
      const f=jsFragments[i]; if(!f.active)continue;
      f.vel[1]-=g*dt;
      f.pos[0]+=f.vel[0]*dt; f.pos[1]+=f.vel[1]*dt; f.pos[2]+=f.vel[2]*dt;
      if(f.pos[1]<-0.5){
        f.pos[1]=-0.5; f.vel[1]*=-0.35; f.vel[0]*=0.65; f.vel[2]*=0.65;
        f.ang[0]*=0.5; f.ang[2]*=0.5;
        if(Math.abs(f.vel[1])<0.1)f.active=false;
      }
      const ax=f.ang[0]*dt,ay=f.ang[1]*dt,az=f.ang[2]*dt;
      const qx=f.quat[0],qy=f.quat[1],qz=f.quat[2],qw=f.quat[3];
      f.quat[0]=qx+(qw*ax-qz*ay+qy*az)*0.5;
      f.quat[1]=qy+(qz*ax+qw*ay-qx*az)*0.5;
      f.quat[2]=qz+(-qy*ax+qx*ay+qw*az)*0.5;
      f.quat[3]=qw+(-qx*ax-qy*ay-qz*az)*0.5;
      const len=Math.hypot(f.quat[0],f.quat[1],f.quat[2],f.quat[3]);
      if(len>0){f.quat[0]/=len;f.quat[1]/=len;f.quat[2]/=len;f.quat[3]/=len;}
      const m=fragmentMeshes[i];
      if(m){m.position.set(f.pos[0],f.pos[1],f.pos[2]);m.quaternion.set(f.quat[0],f.quat[1],f.quat[2],f.quat[3]);}
      active++;
    }
    return active;
  }

  // --- Data table ---
  let rowByTime=new Map();
  function buildTable(result){
    rowByTime=new Map();
    const frames=result.frames, vt=result.terminalVelocity;
    const hasWind=(Math.abs(+inpWindX.value)>0.01||Math.abs(+inpWindZ.value)>0.01);
    const STEP=0.1; let nextT=0,rowCount=0;
    const html=[];
    for(let i=0;i<frames.length;i++){
      const f=frames[i];
      if(f.t<nextT-0.001)continue;
      nextT=Math.round((f.t+STEP)*10)/10;
      const pct=vt>0?Math.min(999,Math.abs(f.v)/vt*100):0;
      const barW=Math.min(80,pct*0.8);
      const barColor=pct<50?'#58a6ff':pct<90?'#f0a500':'#f85149';
      const atmColor=ATM_COLOR[f.atm]||'#6e7681';
      const driftCols=hasWind
        ?`<td>${(f.px||0).toFixed(1)}</td><td>${(f.pz||0).toFixed(1)}</td>`
        :`<td style="color:#6e7681">—</td><td style="color:#6e7681">—</td>`;
      html.push(
        `<tr data-t="${f.t.toFixed(1)}">`+
        `<td>${f.t.toFixed(1)}</td>`+
        `<td>${f.h.toFixed(1)}</td>`+
        `<td>${Math.abs(f.v).toFixed(2)}</td>`+
        `<td>${pct.toFixed(1)}%<span class="pct-bar" style="width:${barW}px;background:${barColor}"></span></td>`+
        `<td>${f.a.toFixed(3)}</td>`+
        `<td>${(f.rho||1.225).toFixed(5)}</td>`+
        `<td style="color:${atmColor}">${f.atm||'Troposphere'}</td>`+
        driftCols+`</tr>`
      );
      rowCount++;
    }
    tblBody.innerHTML=html.join('');
    for(const tr of tblBody.children)rowByTime.set(tr.dataset.t,tr);
    tblPlaceholder.style.display='none';
    dataTable.style.display='table';
    tblInfo.textContent=`${rowCount} rows  ·  terminal vel. ${vt.toFixed(2)} m/s`;
  }

  let lastHighlightedRow=null;
  function highlightTable(ph){
    if(!simResult||!rowByTime.size)return;
    const key=(Math.floor(ph*10)/10).toFixed(1);
    const row=rowByTime.get(key);
    if(!row||row===lastHighlightedRow)return;
    if(lastHighlightedRow)lastHighlightedRow.classList.remove('highlight');
    row.classList.add('highlight');
    row.scrollIntoView({block:'nearest'});
    lastHighlightedRow=row;
  }

  // --- Graph ---
  function getDatasets(result,alpha){
    const a=alpha??1;
    const c=(hex,al)=>{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return`rgba(${r},${g},${b},${al})`;};
    if(activeTab==='velocity')return[
      {label:'Velocity (m/s)',color:c('#58a6ff',a),data:result.frames.map(f=>({x:f.t,y:Math.abs(f.v)}))},
      {label:'Terminal Vel.',color:c('#f0a500',a),dashed:true,data:result.frames.map(f=>({x:f.t,y:result.terminalVelocity}))},
    ];
    if(activeTab==='height')   return[{label:'Height (m)',color:c('#3fb950',a),data:result.frames.map(f=>({x:f.t,y:f.h}))}];
    if(activeTab==='acceleration')return[{label:'Acceleration (m/s²)',color:c('#f85149',a),data:result.frames.map(f=>({x:f.t,y:f.a}))}];
    return[{label:'Air Density (kg/m³)',color:c('#a371f7',a),data:result.frames.map(f=>({x:f.t,y:f.rho||0}))}];
  }

  function drawGraph(tab){
    if(!simResult)return;
    if(tab)activeTab=tab;
    const dpr=Math.min(window.devicePixelRatio||1,1.75);
    const W=graphCanvas.offsetWidth,H=graphCanvas.offsetHeight;
    if(!W||!H)return;
    const needW=Math.round(W*dpr),needH=Math.round(H*dpr);
    if(graphCanvas.width!==needW||graphCanvas.height!==needH){graphCanvas.width=needW;graphCanvas.height=needH;}
    const ctx=graphCanvas.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#0d1117'; ctx.fillRect(0,0,W,H);
    const pad={l:46,r:14,t:12,b:28};
    const gW=W-pad.l-pad.r,gH=H-pad.t-pad.b;
    const mainDs=getDatasets(simResult,1);
    const cmpDs=compareResult?getDatasets(compareResult,0.35):[];
    const allDs=[...mainDs,...cmpDs];
    const allFrames=[...simResult.frames,...(compareResult?compareResult.frames:[])];
    const minX=allFrames[0].t;
    let maxX=0,maxY=0;
    for(const f of allFrames)if(f.t>maxX)maxX=f.t;
    for(const d of allDs)for(const p of d.data)if(p.y>maxY)maxY=p.y;
    maxY=maxY*1.08||1;
    const px=x=>pad.l+((x-minX)/(maxX-minX||1))*gW;
    const py=y=>pad.t+gH-(y/maxY)*gH;
    ctx.strokeStyle='#21262d'; ctx.lineWidth=1;
    for(let i=0;i<=5;i++){
      const y=pad.t+gH*(i/5);
      ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+gW,y);ctx.stroke();
      ctx.fillStyle='#6e7681';ctx.font='9px Consolas';ctx.textAlign='right';
      ctx.fillText((maxY*(1-i/5)).toFixed(2),pad.l-3,y+3);
    }
    for(let i=0;i<=4;i++){
      const x=pad.l+gW*(i/4);
      ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,pad.t+gH);ctx.stroke();
      ctx.fillStyle='#6e7681';ctx.font='9px Consolas';ctx.textAlign='center';
      ctx.fillText((minX+(maxX-minX)*(i/4)).toFixed(1)+'s',x,pad.t+gH+14);
    }
    allDs.forEach(ds=>{
      ctx.strokeStyle=ds.color;ctx.lineWidth=ds.dashed?1.5:2;
      ctx.setLineDash(ds.dashed?[5,4]:[]);
      ctx.beginPath();
      ds.data.forEach((p,i)=>{i===0?ctx.moveTo(px(p.x),py(p.y)):ctx.lineTo(px(p.x),py(p.y));});
      ctx.stroke();ctx.setLineDash([]);
    });
    if(playHead>0){
      ctx.strokeStyle='rgba(255,255,255,0.2)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(px(playHead),pad.t);ctx.lineTo(px(playHead),pad.t+gH);ctx.stroke();
    }
    const legendItems=mainDs.map(ds=>`<div class="leg-item"><div class="leg-dot" style="background:${ds.color}"></div>${ds.label}</div>`);
    if(compareResult)legendItems.push(`<div class="leg-item"><div class="leg-dashed"></div>REF</div>`);
    graphLegend.innerHTML=legendItems.join('');
  }

  document.querySelectorAll('.tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active'); activeTab=tab.dataset.tab;
      if(simResult)drawGraph(activeTab);
    });
  });

  // [F3] Save reference for comparison
  btnCompare.addEventListener('click',()=>{
    if(!simResult)return;
    compareResult=simResult;
    cmpBadge.style.display='block';
    btnCompare.classList.add('active');
    drawGraph(activeTab);
  });

  // [F5] Trajectory line toggle
  btnTraj.addEventListener('click',()=>{
    showTraj=!showTraj;
    btnTraj.classList.toggle('active',showTraj);
    if(trajLine){ if(showTraj)scene.add(trajLine); else scene.remove(trajLine); requestRender(); }
  });

  // [F4] Export functions
  function exportPNG(){
    if(!simResult)return;
    drawGraph(activeTab);
    const link=document.createElement('a');
    link.download=`sim-${activeTab}.png`;
    link.href=graphCanvas.toDataURL('image/png');
    link.click();
  }
  function exportCSV(){
    if(!simResult)return;
    const hasWind=(Math.abs(+inpWindX.value)>0.01||Math.abs(+inpWindZ.value)>0.01);
    const header='Time(s),Altitude(m),Velocity(m/s),Acceleration(m/s2),AirDensity(kg/m3),Atmosphere'+(hasWind?',DriftX(m),DriftZ(m)':'');
    const rows=simResult.frames.map(f=>{
      const base=`${f.t.toFixed(3)},${f.h.toFixed(2)},${Math.abs(f.v).toFixed(3)},${f.a.toFixed(4)},${(f.rho||1.225).toFixed(5)},${f.atm}`;
      return hasWind?`${base},${(f.px||0).toFixed(2)},${(f.pz||0).toFixed(2)}`:base;
    });
    const blob=new Blob([header+'\n'+rows.join('\n')],{type:'text/csv'});
    const link=document.createElement('a');
    link.download='sim-trajectory.csv';
    link.href=URL.createObjectURL(blob);
    link.click(); setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }
  function saveJSON(){
    const data={
      version:'2026-6-22(2)',
      mass:+inpMass.value,area:+inpArea.value,cd:+inpCd.value,
      height:+inpHeight.value,v0:+inpV0.value,gravity:+inpG.value,
      windX:+inpWindX.value,windZ:+inpWindZ.value,
      tempOffset:+inpTemp.value,humidity:+inpHumidity.value,
      shape:selShape.value,targetIdx:+selTarget.value,
    };
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const link=document.createElement('a');
    link.download='sim-settings.json';
    link.href=URL.createObjectURL(blob);
    link.click(); setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }
  fileJson.addEventListener('change',()=>{
    const f=fileJson.files[0]; if(!f)return;
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const d=JSON.parse(e.target.result);
        if(d.mass!=null)inpMass.value=d.mass;
        if(d.area!=null)inpArea.value=d.area;
        if(d.cd!=null)inpCd.value=d.cd;
        if(d.height!=null)inpHeight.value=d.height;
        if(d.v0!=null)inpV0.value=d.v0;
        if(d.gravity!=null)inpG.value=d.gravity;
        if(d.windX!=null)inpWindX.value=d.windX;
        if(d.windZ!=null)inpWindZ.value=d.windZ;
        if(d.tempOffset!=null)inpTemp.value=d.tempOffset;
        if(d.humidity!=null)inpHumidity.value=d.humidity;
        if(d.shape)selShape.value=d.shape;
        if(d.targetIdx!=null)selTarget.value=d.targetIdx;
        updateTV(); updateWindHint(); updateAtmHint();
        rebuildFallingMesh(); rebuildTargetMesh();
      }catch(err){console.error('Load JSON failed:',err);}
    };
    reader.readAsText(f); fileJson.value='';
  });
  btnExportPng.addEventListener('click',exportPNG);
  btnExportCsv.addEventListener('click',exportCSV);
  btnSaveJson.addEventListener('click',saveJSON);
  btnLoadJson.addEventListener('click',()=>fileJson.click());

  const LEVEL_CLASS={'No Damage':'lv0','Minor Damage':'lv1','Moderate Damage':'lv2','Severe Damage':'lv3','Total Destruction':'lv4'};

  btnRun.addEventListener('click',async()=>{
    btnRun.disabled=true; btnRun.textContent='Computing...';
    clearFragments(); impacted=false;
    if(targetMesh)targetMesh.visible=true;
    if(craterGroup){scene.remove(craterGroup);craterGroup.children.forEach(m=>{m.geometry.dispose();m.material.dispose();});craterGroup=null;}
    currentH0=+inpHeight.value; currentG=+inpG.value;
    const currentV0=+inpV0.value;
    const wx=+inpWindX.value||0, wz=+inpWindZ.value||0;
    const tempOffset=+inpTemp.value||0, humidity=+inpHumidity.value||50;
    const presetIdx=parseInt(selPreset.value);
    const falling=presetIdx>=0?fallingPresets[presetIdx]:{
      name:selShape.value,mass:+inpMass.value,cd:+inpCd.value,
      area:+inpArea.value,radius:Math.sqrt(+inpArea.value/Math.PI),
    };
    const tgt=targetObjects[+selTarget.value];
    let result=localSimulate();
    if(window.physics&&tgt){
      const res=await window.physics.simulate({
        falling,target:tgt,height:currentH0,gravity:currentG,
        v0:currentV0,windX:wx,windZ:wz,tempOffset,humidity,
      });
      if(res.ok){
        result.terminalVelocity=res.data.terminalVelocity;
        result.impactVelocity=res.data.impactVelocity;
        result.impactData=res.data;
      }
    }
    simResult=result;
    mVt.textContent=result.terminalVelocity.toFixed(3);
    mVi.textContent=result.impactVelocity.toFixed(3);
    mFt.textContent=result.fallTime.toFixed(2);
    mTt.textContent=result.timeToTerminal.toFixed(2);
    chartPh.style.display='none';
    graphCanvas.style.display='block';
    graphLegend.style.display='flex';
    drawGraph(activeTab);
    buildTable(result);
    buildTrajLine(result);
    ovDriftRow.style.display=(Math.abs(wx)>0.01||Math.abs(wz)>0.01)?'flex':'none';
    btnRun.disabled=false; btnRun.textContent='Run Simulation';
    const visualH=Math.min(currentH0,1500);
    fallingMesh.position.set(0,visualH,0);
    fallingMesh.visible=true;
    liveOverlay.style.display='block';
    orbitTarget.set(0,visualH*0.4,0);
    orbitRadius=visualH*0.5+30;
    updateCamera(); playing=true; playHead=0; lastHighlightedRow=null;
    requestRender();
  });

  btnPlay.addEventListener('click',()=>{if(simResult)playing=true;});
  btnStop.addEventListener('click',()=>{playing=false;});
  btnReset.addEventListener('click',()=>{
    playing=false;playHead=0;impacted=false;
    tDisp.textContent='0.000';hBar.style.height='100%';
    if(fallingMesh){fallingMesh.position.set(0,0,0);fallingMesh.visible=true;}
    clearFragments();
    if(targetMesh)targetMesh.visible=true;
    if(craterGroup){scene.remove(craterGroup);craterGroup.children.forEach(m=>{m.geometry.dispose();m.material.dispose();});craterGroup=null;}
    liveOverlay.style.display='none';
    atmBadge.textContent='Ready';atmBadge.style.color='';
    skyMat.uniforms.altitudeFrac.value=0;
    if(lastHighlightedRow){lastHighlightedRow.classList.remove('highlight');lastHighlightedRow=null;}
    if(simResult)drawGraph(activeTab);
    requestRender();
  });

  let cloudTick=0;
  function animLoop(now){
    requestAnimationFrame(animLoop);
    const dt=Math.min((now-lastFrameTime)/1000,0.05);
    lastFrameTime=now;

    if(playing){
      cloudTick++;
      if(cloudTick%3===0){
        cloudGroup.children.forEach((c,i)=>{c.position.x+=(i%2===0?0.4:-0.3);if(c.position.x>2000)c.position.x=-2000;});
      }
    }

    if(playing&&simResult){
      const totalSim=simResult.fallTime;
      const PLAYBACK=Math.max(4,totalSim/15);
      playHead=Math.min(playHead+dt/PLAYBACK*totalSim,totalSim);
      const fi=simResult.frames.findIndex(f=>f.t>=playHead);
      const frame=fi>=0?simResult.frames[fi]:simResult.frames[simResult.frames.length-1];
      tDisp.textContent=frame.t.toFixed(3);
      ovT.textContent=frame.t.toFixed(3);
      ovH.textContent=frame.h.toFixed(1);
      ovV.textContent=Math.abs(frame.v).toFixed(2);
      ovRho.textContent=(frame.rho||1.225).toFixed(4);
      ovAtm.textContent=frame.atm||'Troposphere';
      ovAtm.style.color=ATM_COLOR[frame.atm]||'#58a6ff';
      atmBadge.textContent=frame.atm||'Troposphere';
      atmBadge.style.color=ATM_COLOR[frame.atm]||'#58a6ff';
      if(frame.px!=null){ovPx.textContent=(frame.px||0).toFixed(1);ovPz.textContent=(frame.pz||0).toFixed(1);}
      const pct=Math.max(0,Math.min(1,frame.h/currentH0));
      hBar.style.height=(pct*100)+'%';
      skyMat.uniforms.altitudeFrac.value=Math.min(1,frame.h/40000);
      const visualH=Math.min(currentH0,1500);
      if(fallingMesh){
        fallingMesh.position.x=(frame.px||0)*0.05;
        fallingMesh.position.y=pct*visualH;
        fallingMesh.position.z=(frame.pz||0)*0.05;
        fallingMesh.rotation.x+=0.05; fallingMesh.rotation.z+=0.025;
      }
      orbitTarget.y=fallingMesh.position.y*0.5; updateCamera();
      graphAccum+=dt;
      if(graphAccum>=0.12){drawGraph(activeTab);graphAccum=0;}
      highlightAccum+=dt;
      if(highlightAccum>=0.1){highlightTable(playHead);highlightAccum=0;}
      needsRender=true;
      if(playHead>=totalSim&&!impacted){
        impacted=true;playing=false;
        if(fallingMesh)fallingMesh.visible=false;
        atmBadge.textContent='IMPACT!';atmBadge.style.color='#f85149';
        skyMat.uniforms.altitudeFrac.value=0;
        createCrater(Math.sqrt(+inpArea.value/Math.PI));
        if(simResult.impactData&&window.physics){
          const tgt=targetObjects[+selTarget.value];
          const dr=simResult.impactData.destructionRatio;
          destrFill.style.width=(dr*100).toFixed(1)+'%';
          destrFill.className='destr-fill'+(dr>0.6?' danger':'');
          destrLevel.textContent=simResult.impactData.destructionLevel;
          destrLevel.className='destr-level '+(LEVEL_CLASS[simResult.impactData.destructionLevel]||'');
          window.physics.computeFracture(simResult.impactData,tgt,Math.sqrt(+inpArea.value/Math.PI))
            .then(res=>{if(res.ok)spawnFragments(res.data,tgt.material);});
        }
        drawGraph(activeTab);
      }
    }

    if(fracturing&&fragmentMeshes.length>0){
      const active=stepFragmentsJS(dt,currentG);
      if(active===0)fracturing=false;
      needsRender=true;
    }

    if(dustParticles){
      const pos=dustParticles.geometry.attributes.position.array, vel=dustParticles._vel;
      for(let i=0;i<pos.length;i+=3){pos[i]+=vel[i];pos[i+1]+=vel[i+1];vel[i+1]-=0.001;pos[i+2]+=vel[i+2];}
      dustParticles.geometry.attributes.position.needsUpdate=true;
      dustParticles.material.opacity-=0.005;
      if(dustParticles.material.opacity<=0){scene.remove(dustParticles);dustParticles.geometry.dispose();dustParticles.material.dispose();dustParticles=null;}
      needsRender=true;
    }

    if(needsRender){renderer3.shadowMap.needsUpdate=true;renderer3.render(scene,camera);needsRender=false;}
  }
  requestAnimationFrame(animLoop);
  window.addEventListener('resize',()=>{if(simResult)drawGraph(activeTab);requestRender();});
})();
