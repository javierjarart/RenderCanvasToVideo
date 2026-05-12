const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

canvas.width = 1920;
canvas.height = 1080;

const PARTICLE_COUNT = 500;
const particles = [];

for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        size: Math.random() * 4 + 1,
        hue: Math.random() * 360,
    });
}

function draw(time) {
    const t = time / 1000;

    ctx.fillStyle = "rgba(10, 8, 8, 0.15)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.hue = (p.hue + 0.5) % 360;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, 0.8)`;
        ctx.fill();
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.font = "16px monospace";
    ctx.fillText(`Particles: ${PARTICLE_COUNT} | Time: ${t.toFixed(1)}s`, 20, 30);
}
