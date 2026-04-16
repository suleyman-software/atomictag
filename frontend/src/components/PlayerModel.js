"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";

// ── Lathe ile profil oluşturucu ──────────────────────────────

function createLatheGeometry(profile, segments = 24) {
  const points = profile.map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(points, segments);
}

// ── Tam Vücut İnsansı Model ─────────────────────────────────

function HumanFigure({ hp, maxHp = 100, color }) {
  const groupRef = useRef();
  const hpRatio = hp / maxHp;

  const bodyColor = useMemo(() => {
    return new THREE.Color().lerpColors(
      new THREE.Color("#ef4444"),
      new THREE.Color(color),
      hpRatio
    );
  }, [hpRatio, color]);

  const skinColor = useMemo(() => {
    return new THREE.Color().lerpColors(
      new THREE.Color("#ef4444"),
      new THREE.Color("#e8b89a"),
      hpRatio
    );
  }, [hpRatio]);

  // Nefes alma + düşük HP titreme
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;

    // Nefes alma
    groupRef.current.scale.y = 1 + Math.sin(t * 1.5) * 0.005;

    // Düşük HP titreme
    if (hpRatio < 0.3 && hpRatio > 0) {
      groupRef.current.rotation.z = Math.sin(t * 12) * 0.04;
    } else {
      groupRef.current.rotation.z = 0;
    }
  });

  // Gövde profili (Lathe)
  const torsoGeo = useMemo(
    () =>
      createLatheGeometry([
        [0, 0],       // bel alt
        [0.22, 0.05],
        [0.24, 0.15], // kalça
        [0.2, 0.35],  // bel
        [0.25, 0.55], // göğüs
        [0.27, 0.65], // göğüs üst
        [0.22, 0.75], // omuz
        [0.15, 0.8],  // boyun tabanı
        [0, 0.82],
      ]),
    []
  );

  // Kafa profili (Lathe)
  const headGeo = useMemo(
    () =>
      createLatheGeometry([
        [0, 0],
        [0.13, 0.03], // çene
        [0.16, 0.08], // çene genişleme
        [0.17, 0.15], // yanak
        [0.16, 0.22], // şakak
        [0.15, 0.28], // alın
        [0.12, 0.32], // tepe
        [0.06, 0.35],
        [0, 0.36],
      ]),
    []
  );

  const bodyMat = { color: bodyColor, roughness: 0.6, metalness: 0.1 };
  const skinMat = { color: skinColor, roughness: 0.7, metalness: 0.0 };
  const vestMat = { color: bodyColor, roughness: 0.4, metalness: 0.2 };
  const bootMat = { color: "#1e293b", roughness: 0.5, metalness: 0.3 };
  const gunMetal = { color: "#374151", roughness: 0.3, metalness: 0.8 };

  return (
    <group ref={groupRef} position={[0, -0.9, 0]}>
      {/* ── Kafa ── */}
      <group position={[0, 1.72, 0]}>
        <mesh geometry={headGeo}>
          <meshStandardMaterial {...skinMat} />
        </mesh>

        {/* Gözler */}
        <mesh position={[-0.065, 0.18, 0.14]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
        <mesh position={[0.065, 0.18, 0.14]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>

        {/* Saç */}
        <mesh position={[0, 0.28, 0]}>
          <sphereGeometry args={[0.16, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          <meshStandardMaterial color="#1e1008" roughness={0.9} />
        </mesh>
      </group>

      {/* ── LDR Sensör Topu (kafanın tepesinde) ── */}
      <mesh position={[0, 2.12, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial
          color="#facc15"
          emissive="#facc15"
          emissiveIntensity={hpRatio > 0 ? 0.8 : 0}
          transparent
          opacity={0.9}
        />
      </mesh>
      {/* Sensör halkası */}
      <mesh position={[0, 2.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.1, 0.015, 8, 24]} />
        <meshStandardMaterial
          color="#fbbf24"
          emissive="#f59e0b"
          emissiveIntensity={hpRatio > 0 ? 0.4 : 0}
        />
      </mesh>

      {/* ── Boyun ── */}
      <mesh position={[0, 1.65, 0]}>
        <cylinderGeometry args={[0.06, 0.07, 0.12, 12]} />
        <meshStandardMaterial {...skinMat} />
      </mesh>

      {/* ── Gövde (taktik yelek) ── */}
      <group position={[0, 0.82, 0]}>
        <mesh geometry={torsoGeo}>
          <meshStandardMaterial {...vestMat} />
        </mesh>

        {/* Yelek detayları — omuz padleri */}
        <mesh position={[-0.24, 0.7, 0]} rotation={[0, 0, 0.3]}>
          <boxGeometry args={[0.12, 0.08, 0.18]} />
          <meshStandardMaterial {...vestMat} />
        </mesh>
        <mesh position={[0.24, 0.7, 0]} rotation={[0, 0, -0.3]}>
          <boxGeometry args={[0.12, 0.08, 0.18]} />
          <meshStandardMaterial {...vestMat} />
        </mesh>

        {/* Göğüs plakası */}
        <mesh position={[0, 0.55, 0.16]}>
          <boxGeometry args={[0.3, 0.25, 0.04]} />
          <meshStandardMaterial color={bodyColor} roughness={0.3} metalness={0.4} />
        </mesh>
      </group>

      {/* ── Kemer ── */}
      <mesh position={[0, 0.82, 0]}>
        <cylinderGeometry args={[0.23, 0.23, 0.06, 16]} />
        <meshStandardMaterial color="#292524" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Kemer tokası */}
      <mesh position={[0, 0.82, 0.23]}>
        <boxGeometry args={[0.06, 0.05, 0.02]} />
        <meshStandardMaterial color="#d4a030" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* ── Sol Kol ── */}
      <group position={[-0.32, 1.42, 0]}>
        {/* Üst kol */}
        <mesh position={[0, -0.15, 0]}>
          <capsuleGeometry args={[0.065, 0.25, 6, 12]} />
          <meshStandardMaterial {...vestMat} />
        </mesh>
        {/* Dirsek */}
        <mesh position={[0, -0.32, 0]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial {...skinMat} />
        </mesh>
        {/* Alt kol */}
        <mesh position={[0, -0.48, 0]}>
          <capsuleGeometry args={[0.055, 0.22, 6, 12]} />
          <meshStandardMaterial {...skinMat} />
        </mesh>
        {/* El */}
        <mesh position={[0, -0.64, 0]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial {...skinMat} />
        </mesh>
      </group>

      {/* ── Sağ Kol (silah tutan) ── */}
      <group position={[0.32, 1.42, 0]} rotation={[0.4, 0, -0.15]}>
        {/* Üst kol */}
        <mesh position={[0, -0.15, 0]}>
          <capsuleGeometry args={[0.065, 0.25, 6, 12]} />
          <meshStandardMaterial {...vestMat} />
        </mesh>
        {/* Dirsek */}
        <mesh position={[0, -0.32, 0]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial {...skinMat} />
        </mesh>
        {/* Alt kol */}
        <group position={[0, -0.48, 0]} rotation={[-0.6, 0, 0]}>
          <mesh>
            <capsuleGeometry args={[0.055, 0.22, 6, 12]} />
            <meshStandardMaterial {...skinMat} />
          </mesh>
          {/* El */}
          <mesh position={[0, -0.16, 0]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial {...skinMat} />
          </mesh>

          {/* ── Lazer Silahı ── */}
          <group position={[0, -0.2, 0.08]} rotation={[1.2, 0, 0]}>
            {/* Gövde */}
            <mesh>
              <boxGeometry args={[0.06, 0.28, 0.08]} />
              <meshStandardMaterial {...gunMetal} />
            </mesh>
            {/* Namlu */}
            <mesh position={[0, 0.22, 0]}>
              <cylinderGeometry args={[0.02, 0.025, 0.2, 8]} />
              <meshStandardMaterial {...gunMetal} />
            </mesh>
            {/* Lazer ucu */}
            <mesh position={[0, 0.33, 0]}>
              <sphereGeometry args={[0.018, 8, 8]} />
              <meshStandardMaterial
                color="#ef4444"
                emissive="#ef4444"
                emissiveIntensity={1}
              />
            </mesh>
            {/* Kabza */}
            <mesh position={[0, -0.12, -0.06]} rotation={[0.3, 0, 0]}>
              <boxGeometry args={[0.05, 0.12, 0.05]} />
              <meshStandardMaterial color="#1c1917" roughness={0.8} />
            </mesh>
            {/* Nişangah */}
            <mesh position={[0, 0.1, -0.05]}>
              <boxGeometry args={[0.04, 0.03, 0.02]} />
              <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.3} />
            </mesh>
          </group>
        </group>
      </group>

      {/* ── Sol Bacak ── */}
      <group position={[-0.1, 0.72, 0]}>
        {/* Üst bacak */}
        <mesh position={[0, -0.2, 0]}>
          <capsuleGeometry args={[0.09, 0.3, 6, 12]} />
          <meshStandardMaterial color="#1e293b" roughness={0.7} />
        </mesh>
        {/* Diz */}
        <mesh position={[0, -0.4, 0]}>
          <sphereGeometry args={[0.075, 8, 8]} />
          <meshStandardMaterial color="#1e293b" roughness={0.6} />
        </mesh>
        {/* Alt bacak */}
        <mesh position={[0, -0.58, 0]}>
          <capsuleGeometry args={[0.07, 0.28, 6, 12]} />
          <meshStandardMaterial color="#1e293b" roughness={0.7} />
        </mesh>
        {/* Bot */}
        <mesh position={[0, -0.78, 0.03]}>
          <boxGeometry args={[0.1, 0.1, 0.18]} />
          <meshStandardMaterial {...bootMat} />
        </mesh>
      </group>

      {/* ── Sağ Bacak ── */}
      <group position={[0.1, 0.72, 0]}>
        <mesh position={[0, -0.2, 0]}>
          <capsuleGeometry args={[0.09, 0.3, 6, 12]} />
          <meshStandardMaterial color="#1e293b" roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.4, 0]}>
          <sphereGeometry args={[0.075, 8, 8]} />
          <meshStandardMaterial color="#1e293b" roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.58, 0]}>
          <capsuleGeometry args={[0.07, 0.28, 6, 12]} />
          <meshStandardMaterial color="#1e293b" roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.78, 0.03]}>
          <boxGeometry args={[0.1, 0.1, 0.18]} />
          <meshStandardMaterial {...bootMat} />
        </mesh>
      </group>

      {/* ── Zemin gölge ── */}
      <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.35, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

// ── Dışa Açılan Bileşen ─────────────────────────────────────

export default function PlayerModel({ player, color = "#3b82f6" }) {
  if (!player) return null;

  return (
    <div className="h-[420px] w-full">
      <Canvas
        camera={{ position: [0, 0.8, 2.8], fov: 50 }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 5, 3]} intensity={1.2} castShadow />
        <directionalLight position={[-2, 3, -2]} intensity={0.3} color="#818cf8" />
        <pointLight position={[0, 3, 2]} intensity={0.2} color="#f0abfc" />

        <HumanFigure hp={player.hp} color={color} />

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 1.8}
          autoRotate
          autoRotateSpeed={0.8}
        />
      </Canvas>
    </div>
  );
}
