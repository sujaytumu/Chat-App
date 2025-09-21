import { useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import AuthImagePattern from "../components/AuthImagePattern";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Loader2, Lock, Mail, MessageSquare, UserPlus } from "lucide-react";

const LoginPage = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const { login, isLoggingIn } = useAuthStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    login(formData);
  };

  return (
    <div className="h-screen grid lg:grid-cols-2">
      {/* Left Side - Form */}
      <div className="flex flex-col justify-center items-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="flex flex-col items-center gap-2 group">
              <div
                className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20
              transition-colors"
              >
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold mt-2">Welcome Back</h1>
              <p className="text-base-content/60">Sign in to your account</p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Email</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-base-content/40" />
                </div>
                <input
                  type="email"
                  className={`input input-bordered w-full pl-10`}
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Password</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-base-content/40" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  className={`input input-bordered w-full pl-10`}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-base-content/40" />
                  ) : (
                    <Eye className="h-5 w-5 text-base-content/40" />
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary w-full" disabled={isLoggingIn}>
              {isLoggingIn ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading...
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          {/* Highlighted Create Account Box */}
          <div className="mt-6">
            <Link
              to="/signup"
              className="block border-2 border-primary rounded-xl p-4 text-center shadow-md hover:shadow-xl hover:bg-primary/10 transition-all duration-300"
            >
              <div className="flex items-center justify-center gap-2 text-primary font-semibold">
                <UserPlus className="w-5 h-5" />
                Create New Account
              </div>
              <p className="text-sm text-base-content/60 mt-1">
                Join us today – it only takes a minute!
              </p>
            </Link>
          </div>
        </div>
      </div>

      {/* Right Side - Image/Pattern */}
      <AuthImagePattern
        title={"Welcome back!"}
        subtitle={"Sign in to continue your conversations and catch up with your messages."}
      />
    </div>
  );
};
export default LoginPage;








// import { useState } from "react";
// import { useDispatch, useSelector } from "react-redux";
// import { Link, useNavigate } from "react-router-dom";
// import { Eye, EyeOff } from "lucide-react";
// import toast from "react-hot-toast";
// import axios from "axios";
// import {
//   loginStart,
//   loginSuccess,
//   loginFailure,
// } from "../redux/slices/authSlice";

// const LoginPage = () => {
//   const dispatch = useDispatch();
//   const { loading: isLoggingIn } = useSelector((state) => state.auth);
//   const navigate = useNavigate();

//   const [showPassword, setShowPassword] = useState(false);
//   const [formData, setFormData] = useState({
//     email: "",
//     password: "",
//   });

//   const validateForm = () => {
//     if (!formData.email.trim()) {
//       toast.error("Email is required");
//       return false;
//     }
//     if (!formData.password) {
//       toast.error("Password is required");
//       return false;
//     }
//     return true;
//   };

//   const handleSubmit = async (e) => {
//     e.preventDefault();

//     if (!validateForm()) return;

//     dispatch(loginStart());
//     try {
//       const response = await axios.post("/api/auth/login", formData); // Your backend API
//       dispatch(loginSuccess({ user: response.data.user, token: response.data.token }));
//       toast.success("Logged in successfully!");
//       localStorage.setItem("token", response.data.token);
//       navigate("/"); // Redirect to home page after login
//     } catch (error) {
//       dispatch(loginFailure(error.response?.data?.message || error.message));
//       toast.error(error.response?.data?.message || error.message);
//     }
//   };

//   return (
//     <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white px-4">
//       <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-sm">
//         <h2 className="text-center font-semibold text-xl mb-1">Sign In</h2>
//         <p className="text-center text-gray-500 mb-6 text-sm">
//           Enter your credentials to access your account
//         </p>

//         <form onSubmit={handleSubmit} className="space-y-6">
//           <div>
//             <label htmlFor="email" className="block text-sm font-medium mb-1">
//               Email
//             </label>
//             <input
//               id="email"
//               type="email"
//               autoComplete="email"
//               required
//               value={formData.email}
//               onChange={(e) => setFormData({ ...formData, email: e.target.value })}
//               placeholder="Enter your email"
//               className="w-full rounded-md border border-gray-300 px-4 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
//             />
//           </div>

//           <div className="relative">
//             <label htmlFor="password" className="block text-sm font-medium mb-1">
//               Password
//             </label>
//             <input
//               id="password"
//               type={showPassword ? "text" : "password"}
//               autoComplete="current-password"
//               required
//               value={formData.password}
//               onChange={(e) => setFormData({ ...formData, password: e.target.value })}
//               placeholder="Enter your password"
//               className="w-full rounded-md border border-gray-300 px-4 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
//             />
//             <button
//               type="button"
//               onClick={() => setShowPassword(!showPassword)}
//               className="absolute top-1/2 right-3 transform -translate-y-1/2 text-gray-400"
//               aria-label={showPassword ? "Hide password" : "Show password"}
//             >
//               {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
//             </button>
//           </div>

//           <button
//             type="submit"
//             disabled={isLoggingIn}
//             className="block w-full bg-blue-600 text-white rounded-full py-2 font-semibold hover:bg-blue-700 transition"
//           >
//             {isLoggingIn ? "Loading..." : "Sign In"}
//           </button>
//         </form>

//         <p className="text-center mt-5 text-gray-600 text-sm">
//           Don't have an account?{" "}
//           <Link to="/signup" className="text-blue-600 hover:underline">
//             Sign up
//           </Link>
//         </p>
//       </div>
//     </div>
//   );
// };

// export default LoginPage;
