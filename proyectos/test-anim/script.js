const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

canvas.width = 1920;
canvas.height = 1080;

function draw(time) {
    const t = time / 1000;

    ctx.fillStyle = "#0a0808";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = 200 + Math.sin(t * 2) * 100;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${t * 60 % 360}, 80%, 60%)`;
    ctx.fill();

    ctx.strokeStyle = "white";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = "white";
    ctx.font = "24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Frame: ${(t * 60).toFixed(0)}`, cx, cy + 40);
}
