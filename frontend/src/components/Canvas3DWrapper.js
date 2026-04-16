"use client";

import { Component } from "react";

export class Canvas3DErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-[400px] items-center justify-center text-gray-500 text-sm">
          3D model yüklenemedi
        </div>
      );
    }
    return this.props.children;
  }
}
