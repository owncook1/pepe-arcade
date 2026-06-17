import { useEffect, useRef } from "preact/hooks";

export default function JetFrog() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    let x = 200;
    let y = 200;

    const keys: Record<string, boolean> = {};

    const down = (e: KeyboardEvent) => {
      keys[e.key] = true;
    };

    const up = (e: KeyboardEvent) => {
      keys[e.key] = false;
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    function loop() {
      if (keys["ArrowLeft"]) x -= 5;
      if (keys["ArrowRight"]) x += 5;
      if (keys["ArrowUp"]) y -= 5;
      if (keys["ArrowDown"]) y += 5;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "lime";
      ctx.fillRect(x, y, 40, 40);

      requestAnimationFrame(loop);
    }

    loop();

    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={600}
      style={{ border: "1px solid white" }}
    />
  );
}
