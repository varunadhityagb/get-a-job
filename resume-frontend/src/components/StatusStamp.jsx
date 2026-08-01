export default function StatusStamp({ status }) {
  const label = { pending: "In progress", done: "Done", failed: "Failed" }[status] || status;
  return <span className={`stamp ${status}`}>{label}</span>;
}
