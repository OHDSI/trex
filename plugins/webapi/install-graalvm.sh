#!/bin/bash

# Pinned, not "latest". Whether a native image honours runtime
# javax.net.ssl.trustStore* properties is a property of the toolchain build, so
# a floating version can change TLS trust behaviour with no code change. 21.0.12
# is the build that was verified to honour them. Bump deliberately, and re-verify
# the runtime-truststore behaviour when you do.
GRAAL_VERSION=21
GRAAL_FULL_VERSION=21.0.12

# Validate that GRAAL_HOME is provided from environment
if [[ -z "${GRAAL_HOME:-}" ]]; then
    echo "Error: GRAAL_HOME environment variable is required"
    exit 1
fi

echo "Installing GraalVM ${GRAAL_VERSION} to ${GRAAL_HOME}"

# Oracle GraalVM ships per-arch tarballs (linux-x64 / linux-aarch64). Pick the
# one matching the build host so this works on both amd64 and arm64 runners.
case "$(uname -m)" in
    x86_64|amd64) GRAAL_ARCH=x64 ;;
    aarch64|arm64) GRAAL_ARCH=aarch64 ;;
    *) echo "Error: unsupported architecture $(uname -m)"; exit 1 ;;
esac

case "${GRAAL_ARCH}" in
    x64)     GRAAL_SHA256=b007ff64c425f85bbe0e686107044fba6ca5054a7e89271a473767f546aaddc1 ;;
    aarch64) GRAAL_SHA256=e37877e3a67cd5c7be6172e8e26ecae7e5b4c76dd78f1d34f880cb7b985ebfd8 ;;
esac

curl -fsSL -o /tmp/graal.tar.gz "https://download.oracle.com/graalvm/${GRAAL_VERSION}/archive/graalvm-jdk-${GRAAL_FULL_VERSION}_linux-${GRAAL_ARCH}_bin.tar.gz"

echo "${GRAAL_SHA256}  /tmp/graal.tar.gz" | sha256sum -c - \
    || { echo "Error: GraalVM tarball checksum mismatch"; exit 1; }

mkdir -p /opt
tar -xzf /tmp/graal.tar.gz -C /opt

extracted_dir=$(tar -tzf /tmp/graal.tar.gz | head -1 | cut -d/ -f1)
echo "Extracted directory: ${extracted_dir}"

if [[ -d "/opt/${extracted_dir}" ]]; then
    mv "/opt/${extracted_dir}" "${GRAAL_HOME}"
else
    echo "Error: Expected directory /opt/${extracted_dir} not found"
    exit 1
fi

rm /tmp/graal.tar.gz

echo "GraalVM installation contents:"
ls -al "${GRAAL_HOME}/bin"

if command -v native-image >/dev/null 2>&1; then
    echo "native-image found in PATH"
    native-image --version
elif [[ -f "${GRAAL_HOME}/lib/svm/bin/native-image" ]]; then
    echo "native-image found in GraalVM lib/svm/bin"
    "${GRAAL_HOME}/lib/svm/bin/native-image" --version
else
    echo "Error: native-image not found in PATH or ${GRAAL_HOME}/lib/svm/bin/"
    echo "GraalVM installation may be incomplete or missing native-image component"
    exit 1
fi

echo "GraalVM installation completed successfully"