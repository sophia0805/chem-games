import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";
import { AuthProvider } from "./context/AuthContext";
import NavBar from "./components/NavBar";
import Landing from "./pages/Landing";
import Discover from "./pages/Discover";
import Saved from "./pages/Saved";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import MyClasses from "./pages/MyClasses";
import ClassDetail from "./pages/ClassDetail";
import CreateClass from "./pages/CreateClass";
import JoinClass from "./pages/JoinClass";
import LabEquipmentGame from "./pages/LabEquipmentGame";
import GameRouteGuard from "./components/GameRouteGuard";
import { GAME_CATALOG } from "./games/catalog";
import Footer from "./components/Footer";

const labEquipmentGame = GAME_CATALOG.find((game) => game.slug === "lab-equipment");

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="app-shell">
          <NavBar />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/discover" element={<Discover />} />
            <Route
              path="/discover/lab-equipment"
              element={
                labEquipmentGame ? (
                  <GameRouteGuard game={labEquipmentGame}>
                    <LabEquipmentGame />
                  </GameRouteGuard>
                ) : (
                  <LabEquipmentGame />
                )
              }
            />
            <Route path="/saved" element={<Saved />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/classes" element={<MyClasses />} />
            <Route path="/classes/create" element={<CreateClass />} />
            <Route path="/classes/join" element={<JoinClass />} />
            <Route path="/classes/:classId" element={<ClassDetail />} />
          </Routes>
          <Footer />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
