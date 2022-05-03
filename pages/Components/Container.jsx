export default function ({ children, styling }) {
  return (
    <div class={`p-10 m-10 ${styling}`}>
      {children}
    </div>
  );
}
