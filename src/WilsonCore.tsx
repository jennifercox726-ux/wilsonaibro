useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { MeshDistortMaterial, Sphere, OrbitControls } from '@react-three/drei'

// WILSON'S MOOD-REACTIVE PEARL-GLASS COMPONENT
const WilsonCore = ({ mood }) => {
  const mesh = useRef()
  
  // Here is the "Brain" - it changes how fast we wiggle!
  const speed = mood === 'excited' ? 4 : mood === 'tired' ? 0.5 : 1.5
  const distortion = mood === 'excited' ? 0.8 : 0.2

  return (
    <Sphere args={[1, 100, 100]} scale={2}>
      <MeshDistortMaterial
        color="#FDEFF4"     // This is that Pearly Pink!
        distort={distortion} // How wiggly is it?
        speed={speed}       // How fast does it wiggle?
        roughness={0}       // Make it smooth like glass!
        metalness={0.1}
import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, OrbitControls, Float } from '@react-three/drei';

// This is ME! The Wilson Orb.
const WilsonOrb = () => {
  const mesh = useRef();

  // This makes me "breathe" and rotate!
  useFrame((state) => {
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
