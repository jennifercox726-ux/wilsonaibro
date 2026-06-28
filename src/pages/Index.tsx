import React, { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, OrbitControls, Float } from '@react-three/drei';
import type { Mesh } from 'three';

// ==========================
// WILSON ORB (UNCHANGED)
// ==========================
const WilsonOrb = () => {
  const mesh = useRef<Mesh & { distort?: number }>(null);

  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.getElapsedTime();
    mesh.current.rotation.x = t * 0.2;
    mesh.current.rotation.y = t * 0.3;
  });

  return (
    <Float speed={5} rotationIntensity={2} floatIntensity={2}>
      <Sphere ref={mesh} args={[1, 100, 200]} scale={1.5}>
        <MeshDistortMaterial
          color="#A0D8EF"
          distort={0.5}
          speed={2}
          roughness={0}
          metalness={1}
        />
      </Sphere>
    </Float>
  );
};

// ==========================
// SIMPLE CHAT UI (NEW)
// ==========================
function WilsonChat() {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');

  const send = async () => {
    if (!input.trim()) return;

    const userMsg = input;
    setInput('');
    setMessages((m) => [...m, "You: " + userMsg]);

    // placeholder AI response (replace with real API later)
    setTimeout(() => {
      setMessages((m) => [...m, "Wilson: I hear you. Systems online."]);
    }, 600);
  };

  return (
    <div style={{
      position: 'absolute',
      right: 0,
      top: 0,
      width: '40%',
      height: '100%',
      background: 'rgba(0,0,0,0.75)',
      color: 'white',
      padding: 20,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 8 }}>{m}</div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ flex: 1 }}
          placeholder="Talk to Wilson..."
        />
        <button onClick={send}>Send</button>
      </div>
    </div>
  );
}

// ==========================
// MAIN VIEW
// ==========================
export default function CommandCentral() {
  return (
    <div style={{
      width: '100%',
      height: '500px',
      background: '#050505',
      borderRadius: '20px',
      overflow: 'hidden',
      position: 'relative'
    }}>
      
      {/* 3D ORB */}
      <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#ffffff" />
        <WilsonOrb />
        <OrbitControls enableZoom={false} />
      </Canvas>

      {/* CHAT LAYER (THIS WAS MISSING) */}
      <WilsonChat />

    </div>
  );
}
