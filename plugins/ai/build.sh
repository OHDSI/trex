#!/bin/bash
# Exit immediately if a command exits with a non-zero status.
set -e

sudo apt-get update
sudo apt-get install -y build-essential cmake python3 python3-pip pkg-config libssl-dev libvulkan1 libvulkan-dev vulkan-tools glslc libshaderc1 spirv-tools vulkan-validationlayers mesa-vulkan-drivers 

echo "Building extension..."
make configure
make release

echo "Moving extension binary..."
mv build/release/extension/*/*.trex .

echo "Signing extension (if key available)..."
../extension-ci-tools/extension_signing/sign-if-key.sh

echo "Build complete."
