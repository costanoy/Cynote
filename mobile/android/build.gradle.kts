allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

// Built as a plain java.io.File (not Gradle's Directory.dir("../../build")
// relative-path resolution) - on a Windows account whose profile folder
// name has a space in it ("Vinicius Costa"), that relative resolution
// mangles the path into two segments ("Vinicius" + " Costa"), which then
// fails to create because "C:\Users\Vinicius" isn't a real directory.
val newBuildDir: File = File(rootDir.parentFile, "build")
rootProject.layout.buildDirectory.set(newBuildDir)

subprojects {
    val newSubprojectBuildDir = File(newBuildDir, project.name)
    project.layout.buildDirectory.set(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
