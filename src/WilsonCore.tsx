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
