import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function MindscapePage({ setMood, onNext }) {
  const videoRef = useRef(null);
  const [moodData, setMoodData] = useState(null);

  // three.js refs
  const mountRef = useRef(null);
  const cubeRef = useRef(null);

  // start webcam
  useEffect(() => {
    async function enableCam() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play(); 
        }
      } catch (err) {
        console.error("Webcam error:", err);
      }
    }
    enableCam();
  }, []);

  // send snapshot to backend every 5s
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!videoRef.current || videoRef.current.videoWidth === 0) return;

      // capture frame
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(videoRef.current, 0, 0);

      canvas.toBlob(async (blob) => {
        if (!blob) return;

        const formData = new FormData();
        formData.append("file", blob, "frame.jpg");

        try {
          const res = await fetch("http://localhost:8000/api/mood/analyze", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          setMoodData(data);
          setMood(data.mood);
          updateScene(data.mood);
        } catch (err) {
          console.error("API error:", err);
        }
      }, "image/jpeg");
    }, 5000);

    return () => clearInterval(interval);
  }, [setMood]);

  // setup Three.js scene
  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current; 

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    camera.position.z = 5;

    const animate = function () {
      requestAnimationFrame(animate);
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;
      renderer.render(scene, camera);
    };
    animate();

    cubeRef.current = cube;

    return () => {
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // update 3d scene based on mood
  const updateScene = (mood) => {
    if (!cubeRef.current) return;
    if (mood === "happy") cubeRef.current.material.color.set(0xffff00); 
    else if (mood === "stressed") cubeRef.current.material.color.set(0xff0000); 
    else cubeRef.current.material.color.set(0x00ff00);
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
      <h1 className="text-3xl font-bold mb-4">🌌 Mindscape</h1>

      {/* Webcam Preview */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-64 h-48 rounded-lg border-2 border-gray-400 bg-black object-cover"
      />

      {/* 3D Scene */}
      <div
        ref={mountRef}
        className="w-64 h-64 mt-4 border-2 border-white rounded-lg"
      ></div>

      {/* Mood Results */}
      <div className="mt-4 text-center">
        {moodData ? (
          <>
            <p className="text-xl">
              Mood: <span className="font-bold">{moodData.mood}</span>
            </p>
            {moodData.suggested_trigger && (
              <p className="text-red-400">
                ⚠️ Suggestion: Avoid {moodData.suggested_trigger}
              </p>
            )}
          </>
        ) : (
          <p>Analyzing mood…</p>
        )}
      </div>

      <button
        onClick={onNext}
        className="mt-6 px-6 py-3 bg-blue-500 rounded-lg text-white hover:bg-blue-600"
      >
        Continue to Navigation →
      </button>
    </div>
  );
}