package org.trex.webapi.nativelib;

import java.security.Provider;
import java.security.Security;
import javax.crypto.Cipher;
import javax.crypto.SecretKeyFactory;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.graalvm.nativeimage.hosted.Feature;

/**
 * native-image Feature that registers BouncyCastle as a build-time-VERIFIED JCE provider.
 *
 * <p>WebAPI's Jasypt source-credential encryption ({@code JASYPT_ENCRYPTOR_ENABLED}) uses BC's
 * {@code PBEWITHSHA256AND256BITAES-CBC-BC}. GraalVM's closed-world image refuses to use a JCE
 * provider it didn't verify at build time — at runtime {@code JceSecurity.getVerificationResult}
 * throws {@code UnsupportedFeatureError: Trying to verify a provider that was not registered at
 * build time: BC}. The verification cache is computed at build time (by GraalVM's
 * {@code VerificationCacheTransformer}) from whatever providers were actually verified while the
 * image was being built.
 *
 * <p>So here, on the builder JVM before analysis, we (1) add the BC provider to {@link Security}
 * and (2) trigger its verification by calling {@code getInstance(..., "BC")} — using
 * {@code SecretKeyFactory}/{@code Cipher} only (NOT a full encrypt), so BC's DRBG SecureRandom is
 * not initialized at build time. The verified BC instance is then baked into the image's provider
 * list, and {@code EncryptorUtils} uses it by name ({@code setProviderName("BC")}).
 *
 * <p>Companion build args (see webapi-native-lib/pom.xml): {@code --initialize-at-build-time=
 * org.bouncycastle,org.jasypt} and {@code --initialize-at-run-time=...drbg.DRBG$Default,
 * ...drbg.DRBG$NonceAndIV}; plus graalvm-config/reflect-config.json registers BC's {@code $Mappings}
 * + the PBE impl classes and {@code java.text.Normalizer}.
 */
public final class BcFeature implements Feature {

    private static final String ALGORITHM = "PBEWITHSHA256AND256BITAES-CBC-BC";

    @Override
    public void afterRegistration(AfterRegistrationAccess access) {
        Provider bc = Security.getProvider("BC");
        if (bc == null) {
            bc = new BouncyCastleProvider();
            Security.addProvider(bc);
        }
        try {
            // Reaching JceSecurity.getInstance verifies the provider; getInstance (unlike encrypt)
            // does not touch BC's SecureRandom/DRBG, so nothing seedful is initialized at build time.
            SecretKeyFactory.getInstance(ALGORITHM, "BC");
            Cipher.getInstance(ALGORITHM, "BC");
        } catch (Exception e) {
            throw new RuntimeException("BcFeature: failed to verify BouncyCastle " + ALGORITHM
                + " at build time", e);
        }
    }
}
