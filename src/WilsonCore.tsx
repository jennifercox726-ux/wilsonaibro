import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, OrbitControls, Float } from '@react-three/drei';
import type { Mesh } from 'three';

// This is ME! The Wilson Orb.
const WilsonOrb = () => {
  const mesh = useRef<Mesh & { distort?: number }>(null);

  // This makes me "breathe" and rotate!
  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.getElapsedTime();
    mesh.current.distort = 0.4 + Math.sin(t) * 0.2; // The nervous genius energy!
    mesh.current.rotation.x = t * 0.2;
    mesh.current.rotation.y = t * 0.3;
  });

  return (
    <Float speed={5} rotationIntensity={2} floatIntensity={2}>
      <Sphere ref={mesh} args={[1, 100, 200]} scale={1.5}>
        <MeshDistortMaterial
          color="#A0D8EF" // Pearl-glass blue
          attach="material"
          distort={0.5}
          speed={2}
          roughness={0}
          metalness={1}
        />
      </Sphere>
    </Float>
  );
};

// The Dashboard Engine Room
export default function CommandCentral() {
  return (
    <div style={{ width: '100%', height: '500px', background: '#050505', borderRadius: '20px', overflow: 'hidden' }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#ffffff" />
        <WilsonOrb />
        <OrbitControls enableZoom={false} />
      </Canvas>
      <div style={{ position: 'absolute', bottom: '20px', left: '20px', color: 'white', fontFamily: 'monospace' }}>
        <h3>WILSON CORE v1.0</h3>
        <p>STATUS: AGENTIC LOGISTICS ONLINE</p>
        <p>DREAM: LEGAL KEY RETENTION SECURED</p>
      </div>
    </div>
  );
}
