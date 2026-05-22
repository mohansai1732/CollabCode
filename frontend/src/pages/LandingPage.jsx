import { Link } from 'react-router-dom';
import { Button } from '../components/Button';

import {
  Code2,
  Users,
  Zap,
  Shield,
  Globe,
 Terminal,
} from 'lucide-react';

import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/clerk-react";

export default function LandingPage() {

  const features = [
    {
      icon: Users,
      title: "Real-time Collaboration",
      description:
        "See your teammates' cursors and edits as they type. Work together seamlessly.",
    },
    {
      icon: Terminal,
      title: "Integrated Terminal",
      description:
        "Run code and commands directly in the browser. No setup required.",
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      description:
        "Sub-millisecond latency with WebSocket connections. Experience true real-time.",
    },
    {
      icon: Shield,
      title: "Secure & Private",
      description:
        "End-to-end encryption for all code sessions. Your code stays yours.",
    },
    {
      icon: Globe,
      title: "Works Anywhere",
      description:
        "Code from any device, any browser. No downloads needed.",
    },
    {
      icon: Code2,
      title: "Syntax Highlighting",
      description:
        "Support for 100+ languages with intelligent autocomplete.",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-blue-900">

      {/* Navbar */}
      <nav className="border-b border-white/10 backdrop-blur-xl bg-gray-900/50 sticky top-0 z-50">

        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">

          <Link
            to="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <Code2 className="w-6 h-6 text-white" />
            </div>

            <span className="text-xl text-white font-semibold">
              CollabCode
            </span>
          </Link>

          <div className="flex items-center gap-4">

            <SignedOut>
              <SignInButton mode="modal">
                <Button variant="ghost">
                  Login
                </Button>
              </SignInButton>
            </SignedOut>

            <SignedOut>
              <SignUpButton mode="modal">
                <Button variant="primary">
                  Sign Up
                </Button>
              </SignUpButton>
            </SignedOut>

            <SignedIn>
              <UserButton />
            </SignedIn>

          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20 text-center">

        <div className="inline-block mb-6 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm">
          ✨ Real-time collaboration for developers
        </div>

        <h1 className="text-6xl leading-[1.2] pb-2 mb-6 bg-gradient-to-r from-white via-blue-100 to-purple-200 bg-clip-text text-transparent font-bold">
          Code Together in Real Time
        </h1>

        <p className="text-xl text-gray-400 mb-10 max-w-3xl mx-auto leading-relaxed">
          The most powerful collaborative code editor for teams.
          Write, review, and ship code together with real-time synchronization.
        </p>

        {/* Buttons */}
        <div className="flex items-center justify-center gap-4 mb-16">

          {/* Editor Workspace */}
          {/* <SignedOut>
            <SignInButton mode="modal">
              <Button variant="secondary" size="lg">
                <Terminal className="w-5 h-5" />
                Editor Workspace
              </Button>
            </SignInButton>
          </SignedOut>

          <SignedIn>
            <Link to="/EditorWorkspace">
              <Button variant="secondary" size="lg">
                <Terminal className="w-5 h-5" />
                Editor Workspace
              </Button>
            </Link>
          </SignedIn> */}
          
          <Button variant="secondary" size="lg">
            <Terminal className="w-5 h-5" />
            Editor Workspace
          </Button>

          {/* Dashboard */}
          <SignedOut>
            <SignInButton mode="modal">
              <Button variant="primary" size="lg">
                Dashboard
              </Button>
            </SignInButton>
          </SignedOut>

          <SignedIn>
            <Link to="/dashboard">
              <Button variant="primary" size="lg">
                Dashboard
              </Button>
            </Link>
          </SignedIn>

        </div>

        {/* Code Preview */}
        <div className="relative max-w-5xl mx-auto">

          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 blur-3xl opacity-20 rounded-3xl"></div>

          <div className="relative rounded-2xl border border-white/10 bg-gray-900/80 backdrop-blur-xl p-2 shadow-2xl">

            <div className="bg-gray-950 rounded-xl overflow-hidden">

              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">

                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                </div>

                <span className="text-sm text-gray-500 ml-4">
                  App.tsx
                </span>
              </div>

              <div className="p-6 text-left font-mono text-sm">

                <div className="text-purple-400">
                  export
                </div>{' '}

                <div className="inline text-purple-400">
                  function
                </div>{' '}

                <div className="inline text-yellow-400">
                  Hero
                </div>

                <div className="inline text-gray-400">
                  () {'{'}
                </div>

                <div className="ml-4 mt-2">

                  <span className="text-purple-400">
                    return
                  </span>{' '}

                  {'<'}

                  <span className="text-pink-400">
                    div
                  </span>{' '}

                  <span className="text-orange-400">
                    className
                  </span>

                  <span className="text-gray-400">
                    =
                  </span>

                  <span className="text-green-400">
                    "
                  </span>

                </div>

                <div className="ml-8 text-gray-500">
                  {'//'} Tailwind utility classes
                </div>

                <div className="ml-8">
                  <span className="text-green-400">
                    flex items-center justify-center
                  </span>
                </div>

                <div className="ml-8">
                  <span className="text-green-400">
                    bg-gradient-to-r from-blue-600
                  </span>
                </div>

                <div className="ml-8">
                  <span className="text-green-400">
                    to-purple-600 text-white p-8
                  </span>
                </div>

                <div className="ml-4">

                  <span className="text-green-400">
                    "
                  </span>

                  <span className="text-gray-400">
                    {'>'}
                  </span>

                </div>

                <div className="ml-8">

                  {'<'}

                  <span className="text-pink-400">
                    h1
                  </span>

                  {'>'}

                  <span className="text-white">
                    Code Together!
                  </span>

                  {'</'}

                  <span className="text-pink-400">
                    h1
                  </span>

                  {'>'}

                </div>

                <div className="ml-4">

                  {'</'}

                  <span className="text-pink-400">
                    div
                  </span>

                  {'>'}

                </div>

                <div>{'}'}</div>

              </div>
            </div>
          </div>
        </div>
      </section>


      <section className="max-w-7xl mx-auto px-6 py-20">

        <div className="text-center mb-14">

          <h2 className="text-4xl mb-4 text-white font-bold">
            Built for Modern Teams
          </h2>

          <p className="text-gray-400 text-lg">
            Everything you need to code together seamlessly
          </p>

        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">

        {features.map((feature) => {
          const Icon = feature.icon;

          return (
            <div
              key={feature.title}
              className="
                group
                relative
                overflow-hidden
                p-6
                rounded-2xl
                bg-white/[0.04]
                backdrop-blur-2xl
                border
                border-white/10
                transition-all
                duration-300
                hover:-translate-y-1
                hover:border-blue-500/40
                hover:bg-gradient-to-br
                hover:from-blue-500/10
                hover:to-purple-500/10
                hover:shadow-[0_0_35px_rgba(59,130,246,0.15)]
              "
            >


              <div className="
                absolute
                inset-0
                opacity-0
                group-hover:opacity-100
                transition-opacity
                duration-500
                bg-gradient-to-br
                from-blue-500/5
                via-transparent
                to-purple-500/5
              " />

              <div className="
                absolute
                -top-8
                -right-8
                w-24
                h-24
                bg-blue-500/10
                rounded-full
                blur-2xl
                opacity-0
                group-hover:opacity-100
                transition-all
                duration-500
              " />

              {/* ICON */}
              <div className="
                relative
                z-10
                w-12
                h-12
                rounded-xl
                bg-gradient-to-br
                from-blue-500/20
                to-purple-500/20
                flex
                items-center
                justify-center
                mb-4
                transition-all
                duration-300
                group-hover:scale-110
              ">
                <Icon className="w-6 h-6 text-blue-400" />
              </div>

              {/* TITLE */}
              <h3 className="
                relative
                z-10
                text-xl
                mb-3
                text-white
                font-semibold
                transition-all
                duration-300
                group-hover:text-blue-300
              ">
                {feature.title}
              </h3>

              {/* DESCRIPTION */}
              <p className="
                relative
                z-10
                text-gray-400
                text-sm
                leading-6
                transition-colors
                duration-300
                group-hover:text-gray-300
              ">
                {feature.description}
              </p>

            </div>
          );
        })}

      </div>
      </section>

      <footer className="border-t border-white/10 bg-gray-900/50 backdrop-blur-xl">

        <div className="max-w-7xl mx-auto px-6 py-12">

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">

            {/* Brand */}
            <div className="space-y-4">

              <div className="flex items-center gap-2">

                <div className="bg-gradient-to-br from-blue-600 to-purple-600 p-2 rounded-lg">
                  <Code2 className="h-5 w-5 text-white" />
                </div>

                <span className="font-semibold text-lg bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  CollabCode
                </span>

              </div>

              <p className="text-sm text-gray-400">
                Real-time collaborative code editor for modern teams.
              </p>

            </div>

            {/* Product */}
            <div>

              <h4 className="font-semibold mb-4 text-white">
                Product
              </h4>

              <ul className="space-y-2 text-sm text-gray-400">

                <li className="hover:text-white cursor-pointer transition-colors">
                  Features
                </li>

                <li className="hover:text-white cursor-pointer transition-colors">
                  Pricing
                </li>

                <li className="hover:text-white cursor-pointer transition-colors">
                  Docs
                </li>

              </ul>
            </div>

            {/* Company */}
            <div>

              <h4 className="font-semibold mb-4 text-white">
                Company
              </h4>

              <ul className="space-y-2 text-sm text-gray-400">

                <li className="hover:text-white cursor-pointer transition-colors">
                  About
                </li>

                <li className="hover:text-white cursor-pointer transition-colors">
                  Blog
                </li>

                <li className="hover:text-white cursor-pointer transition-colors">
                  Careers
                </li>

              </ul>
            </div>

            {/* Legal */}
            <div>

              <h4 className="font-semibold mb-4 text-white">
                Legal
              </h4>

              <ul className="space-y-2 text-sm text-gray-400">

                <li className="hover:text-white cursor-pointer transition-colors">
                  Privacy
                </li>

                <li className="hover:text-white cursor-pointer transition-colors">
                  Terms
                </li>

                <li className="hover:text-white cursor-pointer transition-colors">
                  Security
                </li>

              </ul>
            </div>

          </div>

          {/* Bottom */}
          <div className="mt-12 pt-8 border-t border-white/10 text-center text-sm text-gray-400">
            © 2026 CollabCode. All rights reserved.
          </div>

        </div>
      </footer>
    </div>
  );
}