import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "com.raphael.jarvis",
  appName: "Jarvis",
  webDir: "dist",
  plugins: {
    LocalNotifications: {
      // Sans icône dédiée, Android prend l'icône de l'application et n'en
      // garde que la silhouette : le lanceur de Jarvis étant plein, la
      // notification s'affiche comme un carré blanc. Celle-ci est un
      // réacteur, en blanc plein, comme Android l'exige pour la barre d'état.
      smallIcon: "ic_stat_jarvis",
      iconColor: "#69C5F5",
    },
  },
}

export default config
