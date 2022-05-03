import Container from "./Container.jsx";
export default function ({ children }) {
  return (
    <Container styling="shadow-lg border-2 transition ease-in-out delay-150 hover:bg-slate-300 duration-300">
      <footer class="text-center font-mono font-thin">
        {children}
        <p>{new Date().getFullYear().toString()}</p>
      </footer>
    </Container>
  );
}
