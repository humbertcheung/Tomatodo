/**
 * Generate the Xcode project for the widget extension.
 *
 * A hand-written .pbxproj is used on purpose: it keeps the widget buildable
 * without xcodegen/tuist, so `npm run widget:build` works on a plain Xcode
 * install. Re-generate with:  node widget/generate-project.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projDir = path.join(here, 'TomatodoWidget.xcodeproj')
fs.mkdirSync(projDir, { recursive: true })

const APP_GROUP = 'group.com.humbert.tomatodo'
const BUNDLE_ID = 'cc.humbert.todo-menubar.widget'
const SOURCES = ['WidgetShared.swift', 'TomatodoWidget.swift']

// The app extension's version MUST match the host app's — macOS refuses to
// register an extension whose version differs, and the widget then never
// shows up in the widget gallery.
const appPkg = JSON.parse(
  fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')
)
const APP_VERSION = appPkg.version
const APP_BUILD = appPkg.version.replace(/[^0-9.]/g, '') || '1'

/* stable 24-hex ids */
const ids = {}
let counter = 0
const id = (key) => {
  if (!ids[key]) ids[key] = 'AA' + String(counter++).padStart(4, '0') + '0000000000000000000000'
  return ids[key]
}

const fileRefs = SOURCES.map((f) => ({ name: f, path: 'TomatodoWidget/' + f, ref: id('ref' + f), build: id('build' + f) }))
const PRODUCT_REF = id('productRef')
const TARGET_ID = id('target')
const PROJECT_ID = id('project')
const SOURCES_PHASE = id('sourcesPhase')
const RESOURCES_PHASE = id('resourcesPhase')
const FRAMEWORKS_PHASE = id('frameworksPhase')
const GROUP_MAIN = id('groupMain')
const GROUP_PRODUCTS = id('groupProducts')
const BUILD_CONFIG_LIST_PROJ = id('configListProj')
const BUILD_CONFIG_LIST_TARGET = id('configListTarget')
const PROJ_DEBUG = id('projDebug')
const PROJ_RELEASE = id('projRelease')
const TARGET_DEBUG = id('targetDebug')
const TARGET_RELEASE = id('targetRelease')
const ENTITLEMENTS = id('entitlements')
const INFO_PLIST = id('infoPlist')

const fileType = (name) => (name.endsWith('.swift') ? 'sourcecode.swift' : 'text')

const pbx = `// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 56;
	objects = {

/* Begin PBXBuildFile section */
${fileRefs.map((f) => `\t\t${f.build} /* ${f.name} in Sources */ = {isa = PBXBuildFile; fileRef = ${f.ref} /* ${f.name} */; };`).join('\n')}
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
${fileRefs.map((f) => `\t\t${f.ref} /* ${f.name} */ = {isa = PBXFileReference; lastKnownFileType = ${fileType(f.name)}; path = ${f.path}; sourceTree = "<group>"; };`).join('\n')}
\t\t${PRODUCT_REF} /* TomatodoWidget.appex */ = {isa = PBXFileReference; explicitFileType = "wrapper.app-extension"; includeInIndex = 0; path = TomatodoWidget.appex; sourceTree = BUILT_PRODUCTS_DIR; };
\t\t${ENTITLEMENTS} /* TomatodoWidget.entitlements */ = {isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = TomatodoWidget.entitlements; sourceTree = "<group>"; };
\t\t${INFO_PLIST} /* Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };
/* End PBXFileReference section */

/* Begin PBXFrameworksBuildPhase section */
\t\t${FRAMEWORKS_PHASE} /* Frameworks */ = {
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
\t\t${GROUP_MAIN} = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
${fileRefs.map((f) => `\t\t\t\t${f.ref} /* ${f.name} */,`).join('\n')}
\t\t\t\t${ENTITLEMENTS} /* TomatodoWidget.entitlements */,
\t\t\t\t${INFO_PLIST} /* Info.plist */,
\t\t\t\t${GROUP_PRODUCTS} /* Products */,
\t\t\t);
\t\t\tsourceTree = "<group>";
\t\t};
\t\t${GROUP_PRODUCTS} /* Products */ = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t${PRODUCT_REF} /* TomatodoWidget.appex */,
\t\t\t);
\t\t\tpath = TomatodoWidget;
\t\t\tsourceTree = "<group>";
\t\t};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
\t\t${TARGET_ID} /* TomatodoWidget */ = {
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = ${BUILD_CONFIG_LIST_TARGET} /* Build configuration list for PBXNativeTarget "TomatodoWidget" */;
\t\t\tbuildPhases = (
\t\t\t\t${SOURCES_PHASE} /* Sources */,
\t\t\t\t${FRAMEWORKS_PHASE} /* Frameworks */,
\t\t\t\t${RESOURCES_PHASE} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tname = TomatodoWidget;
\t\t\tproductName = TomatodoWidget;
\t\t\tproductReference = ${PRODUCT_REF} /* TomatodoWidget.appex */;
\t\t\tproductType = "com.apple.product-type.app-extension";
\t\t};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
\t\t${PROJECT_ID} /* Project object */ = {
\t\t\tisa = PBXProject;
\t\t\tattributes = {
\t\t\t\tBuildIndependentTargetsInParallel = 1;
\t\t\t\tLastSwiftUpdateCheck = 1500;
\t\t\t\tLastUpgradeCheck = 1500;
\t\t\t\tTargetAttributes = {
\t\t\t\t\t${TARGET_ID} = {
\t\t\t\t\t\tCreatedOnToolsVersion = 15.0;
\t\t\t\t\t};
\t\t\t\t};
\t\t\t};
\t\t\tbuildConfigurationList = ${BUILD_CONFIG_LIST_PROJ} /* Build configuration list for PBXProject "TomatodoWidget" */;
\t\t\tcompatibilityVersion = "Xcode 14.0";
\t\t\tdevelopmentRegion = en;
\t\t\thasScannedForEncodings = 0;
\t\t\tknownRegions = (
\t\t\t\ten,
\t\t\t\tBase,
\t\t\t\t"zh-Hans",
\t\t\t);
\t\t\tmainGroup = ${GROUP_MAIN};
\t\t\tproductRefGroup = ${GROUP_PRODUCTS} /* Products */;
\t\t\tprojectDirPath = "";
\t\t\tprojectRoot = "";
\t\t\ttargets = (
\t\t\t\t${TARGET_ID} /* TomatodoWidget */,
\t\t\t);
\t\t};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
\t\t${RESOURCES_PHASE} /* Resources */ = {
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
\t\t${SOURCES_PHASE} /* Sources */ = {
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
${fileRefs.map((f) => `\t\t\t\t${f.build} /* ${f.name} in Sources */,`).join('\n')}
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
\t\t${PROJ_DEBUG} /* Debug */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tALWAYS_SEARCH_USER_PATHS = NO;
\t\t\t\tCLANG_ENABLE_MODULES = YES;
\t\t\t\tCOPY_PHASE_STRIP = NO;
\t\t\t\tDEBUG_INFORMATION_FORMAT = dwarf;
\t\t\t\tENABLE_STRICT_OBJC_MSGSEND = YES;
\t\t\t\tENABLE_TESTABILITY = YES;
\t\t\t\tGCC_OPTIMIZATION_LEVEL = 0;
\t\t\t\tGCC_PREPROCESSOR_DEFINITIONS = (
\t\t\t\t\t"DEBUG=1",
\t\t\t\t\t"$(inherited)",
\t\t\t\t);
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 14.0;
\t\t\t\tMACOSX_DEPLOYMENT_TARGET = 14.0;
\t\t\t\tMTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE;
\t\t\t\tONLY_ACTIVE_ARCH = YES;
\t\t\t\tSDKROOT = macosx;
\t\t\t\tSWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;
\t\t\t\tSWIFT_OPTIMIZATION_LEVEL = "-Onone";
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t};
\t\t\tname = Debug;
\t\t};
\t\t${PROJ_RELEASE} /* Release */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tALWAYS_SEARCH_USER_PATHS = NO;
\t\t\t\tCLANG_ENABLE_MODULES = YES;
\t\t\t\tCOPY_PHASE_STRIP = NO;
\t\t\t\tDEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";
\t\t\t\tENABLE_NS_ASSERTIONS = NO;
\t\t\t\tENABLE_STRICT_OBJC_MSGSEND = YES;
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 14.0;
\t\t\t\tMACOSX_DEPLOYMENT_TARGET = 14.0;
\t\t\t\tMTL_ENABLE_DEBUG_INFO = NO;
\t\t\t\tSDKROOT = macosx;
\t\t\t\tSWIFT_COMPILATION_MODE = wholemodule;
\t\t\t\tSWIFT_OPTIMIZATION_LEVEL = "-O";
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t};
\t\t\tname = Release;
\t\t};
\t\t${TARGET_DEBUG} /* Debug */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tCODE_SIGN_ENTITLEMENTS = TomatodoWidget/TomatodoWidget.entitlements;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = ${APP_BUILD};
\t\t\t\tDEVELOPMENT_TEAM = "";
\t\t\t\tENABLE_HARDENED_RUNTIME = YES;
\t\t\t\tGENERATE_INFOPLIST_FILE = NO;
\t\t\t\tINFOPLIST_FILE = TomatodoWidget/Info.plist;
\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = Tomatodo;
\t\t\t\tINFOPLIST_KEY_NSHumanReadableCopyright = "";
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t\t"@executable_path/../Frameworks",
\t\t\t\t\t"@executable_path/../../../../Applications",
\t\t\t\t);
\t\t\t\tMARKETING_VERSION = ${APP_VERSION};
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = ${BUNDLE_ID};
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSKIP_INSTALL = YES;
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t};
\t\t\tname = Debug;
\t\t};
\t\t${TARGET_RELEASE} /* Release */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tCODE_SIGN_ENTITLEMENTS = TomatodoWidget/TomatodoWidget.entitlements;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = ${APP_BUILD};
\t\t\t\tDEVELOPMENT_TEAM = "";
\t\t\t\tENABLE_HARDENED_RUNTIME = YES;
\t\t\t\tGENERATE_INFOPLIST_FILE = NO;
\t\t\t\tINFOPLIST_FILE = TomatodoWidget/Info.plist;
\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = Tomatodo;
\t\t\t\tINFOPLIST_KEY_NSHumanReadableCopyright = "";
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t\t"@executable_path/../Frameworks",
\t\t\t\t\t"@executable_path/../../../../Applications",
\t\t\t\t);
\t\t\t\tMARKETING_VERSION = ${APP_VERSION};
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = ${BUNDLE_ID};
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSKIP_INSTALL = YES;
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t};
\t\t\tname = Release;
\t\t};
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
\t\t${BUILD_CONFIG_LIST_PROJ} /* Build configuration list for PBXProject "TomatodoWidget" */ = {
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t${PROJ_DEBUG} /* Debug */,
\t\t\t\t${PROJ_RELEASE} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t};
\t\t${BUILD_CONFIG_LIST_TARGET} /* Build configuration list for PBXNativeTarget "TomatodoWidget" */ = {
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t${TARGET_DEBUG} /* Debug */,
\t\t\t\t${TARGET_RELEASE} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t};
/* End XCConfigurationList section */
\t};
	rootObject = ${PROJECT_ID} /* Project object */;
}
`

fs.writeFileSync(path.join(projDir, 'project.pbxproj'), pbx)

// the shared scheme, so xcodebuild -scheme works without opening Xcode
const schemeDir = path.join(projDir, 'xcshareddata', 'xcschemes')
fs.mkdirSync(schemeDir, { recursive: true })
fs.writeFileSync(path.join(schemeDir, 'TomatodoWidget.xcscheme'), `<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion = "1500" version = "1.7">
   <BuildAction parallelizeBuildables = "YES" buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry buildForTesting = "YES" buildForRunning = "YES" buildForProfiling = "YES" buildForArchiving = "YES" buildForAnalyzing = "YES">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "${TARGET_ID}"
               BuildableName = "TomatodoWidget.appex"
               BlueprintName = "TomatodoWidget"
               ReferencedContainer = "container:TomatodoWidget.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv = "YES" />
   <LaunchAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle = "0" useCustomWorkingDirectory = "NO" ignoresPersistentStateOnLaunch = "NO" debugDocumentVersioning = "YES" debugServiceExtension = "internal" allowLocationSimulation = "YES">
   </LaunchAction>
   <ProfileAction buildConfiguration = "Release" shouldUseLaunchSchemeArgsEnv = "YES" savedToolIdentifier = "" useCustomWorkingDirectory = "NO" debugDocumentVersioning = "YES">
   </ProfileAction>
   <AnalyzeAction buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction buildConfiguration = "Release" revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
`)

console.log('widget/TomatodoWidget.xcodeproj generated')
