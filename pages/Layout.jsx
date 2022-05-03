import Footer from "./Components/Footer.jsx";
import Header from "./Components/Header.jsx";
import { Template } from "../.dot/.y/index.ts";
export default function ({ children }) {
  return (
    <div>
      <Header>
        <a class="font-bold" href="/TODO">TODO</a>
      </Header>
      {children}
      <Footer>
        <p>TODO</p>
      </Footer>
    </div>
  );
}
