import { initials } from "../lib/format";

export default function Avatar({ name, size = 40, online, src }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">
      {src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} /> : initials(name)}
      {online && <span className="avatar-dot" />}
    </span>
  );
}
