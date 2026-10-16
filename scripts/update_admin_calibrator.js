const fs = require('fs');
const path = require('path');

const adminDir = path.resolve(__dirname, '..', '..', 'kenditasarl-admin');

// 1. Copy the full upgraded PrintAreaEditorModal component
const sourceModalPath = path.join(__dirname, 'PrintAreaEditorModal.admin.tsx');
const targetModalPath = path.join(adminDir, 'src', 'components', 'admin', 'PrintAreaEditorModal.tsx');

fs.copyFileSync(sourceModalPath, targetModalPath);
console.log('✅ PrintAreaEditorModal.tsx replaced successfully in admin!');

// 2. Update new/page.tsx in admin
const newPagePath = path.join(adminDir, 'src', 'app', '(admin)', 'products', 'new', 'page.tsx');
let newPageCode = fs.readFileSync(newPagePath, 'utf8');

// Update handleSaveCalibration in new/page.tsx to ONLY update the calibrated image
const fixedHandleSaveNew = `const handleSaveCalibration = (printArea: NonNullable<ProductImageItem["printArea"]>) => {
    if (activeCalibrationIndex === null) return;
    const targetImage = productImages[activeCalibrationIndex];
    if (!targetImage) {
      setActiveCalibrationIndex(null);
      return;
    }

    const targetFace = targetImage.face;

    // 1. Update face default in customizationConfig
    setCustomizationConfig((prev: any) => ({
      ...(prev || {}),
      enabled: prev?.enabled ?? true,
      faces: {
        ...(prev?.faces || {}),
        [targetFace]: {
          name: String(targetFace).toUpperCase(),
          enabled: true,
          printArea: {
            id: targetFace,
            name: String(targetFace).toUpperCase(),
            width: printArea.width,
            height: printArea.height,
            top: printArea.y,
            left: printArea.x,
            nativeWidth: printArea.nativeWidth,
            nativeHeight: printArea.nativeHeight,
            physicalWidthCm: printArea.physicalWidthCm || 30,
            physicalHeightCm: printArea.physicalHeightCm || 37.5,
            targetDPI: printArea.targetDPI || 300,
            printMethod: printArea.printMethod || "DTF",
            bleed: printArea.bleed ?? 5,
          },
        },
      },
    }));

    // 2. Only update the single target image that was calibrated (Preserve individual colors!)
    setProductImages((prev) => {
      return prev.map((img, idx) => {
        if (idx === activeCalibrationIndex) {
          return { ...img, printArea };
        }
        return img;
      });
    });

    setActiveCalibrationIndex(null);
  };`;

newPageCode = newPageCode.replace(/const handleSaveCalibration =[\s\S]*?\n  \};/, fixedHandleSaveNew);

const newModalNew = `<PrintAreaEditorModal
          open={activeCalibrationIndex !== null}
          images={productImages}
          variants={variants}
          activeImageIndex={activeCalibrationIndex}
          imageUrl={productImages[activeCalibrationIndex ?? 0]?.url}
          productType={category || "tshirts"}
          faceId={productImages[activeCalibrationIndex ?? 0]?.face || "front"}
          initialPrintArea={productImages[activeCalibrationIndex ?? 0]?.printArea}
          onSave={handleSaveCalibration}
          onSaveAll={(updatedBlankImages: ProductImageItem[], faceConfigMap?: any) => {
            setProductImages((prev) => {
              return prev.map((img) => {
                const match = updatedBlankImages.find((u) => u.id === img.id || (u.colorHex === img.colorHex && u.face === img.face && (u.type || "blank") === (img.type || "blank")));
                if (match) {
                  return { ...img, printArea: match.printArea };
                }
                return img;
              });
            });
            if (faceConfigMap) {
              setCustomizationConfig((prev: any) => ({
                ...(prev || {}),
                enabled: prev?.enabled ?? true,
                faces: {
                  ...(prev?.faces || {}),
                  ...faceConfigMap,
                },
              }));
            }
            setActiveCalibrationIndex(null);
          }}
          onClose={() => setActiveCalibrationIndex(null)}
        />`;

newPageCode = newPageCode.replace(/<PrintAreaEditorModal[\s\S]*?\/>/, newModalNew);
fs.writeFileSync(newPagePath, newPageCode, 'utf8');
console.log('✅ new/page.tsx updated successfully in admin!');

// 3. Update [id]/edit/page.tsx in admin
const editPagePath = path.join(adminDir, 'src', 'app', '(admin)', 'products', '[id]', 'edit', 'page.tsx');
let editPageCode = fs.readFileSync(editPagePath, 'utf8');

const fixedHandleSaveEdit = `const handleSaveCalibration = (printArea: NonNullable<ProductImageItem["printArea"]>) => {
    if (activeCalibrationIndex === null) return;
    const targetImage = productImages[activeCalibrationIndex];
    if (!targetImage) {
      setActiveCalibrationIndex(null);
      return;
    }

    const targetFace = targetImage.face;

    // 1. Update face default in customizationConfig
    setCustomizationConfig((prev: any) => ({
      ...(prev || {}),
      enabled: prev?.enabled ?? true,
      faces: {
        ...(prev?.faces || {}),
        [targetFace]: {
          name: String(targetFace).toUpperCase(),
          enabled: true,
          printArea: {
            id: targetFace,
            name: String(targetFace).toUpperCase(),
            width: printArea.width,
            height: printArea.height,
            top: printArea.y,
            left: printArea.x,
            nativeWidth: printArea.nativeWidth,
            nativeHeight: printArea.nativeHeight,
            physicalWidthCm: printArea.physicalWidthCm || 30,
            physicalHeightCm: printArea.physicalHeightCm || 37.5,
            targetDPI: printArea.targetDPI || 300,
            printMethod: printArea.printMethod || "DTF",
            bleed: printArea.bleed ?? 5,
          },
        },
      },
    }));

    // 2. Only update the single target image that was calibrated (Preserve individual colors!)
    setProductImages((prev) => {
      return prev.map((img, idx) => {
        if (idx === activeCalibrationIndex) {
          return { ...img, printArea };
        }
        return img;
      });
    });

    setActiveCalibrationIndex(null);
    setHasUnsavedChanges(true);
  };`;

editPageCode = editPageCode.replace(/const handleSaveCalibration =[\s\S]*?\n  \};/, fixedHandleSaveEdit);

const newModalEdit = `<PrintAreaEditorModal
          open={activeCalibrationIndex !== null}
          images={productImages}
          variants={variants}
          activeImageIndex={activeCalibrationIndex}
          imageUrl={productImages[activeCalibrationIndex ?? 0]?.url}
          productType={category || "tshirts"}
          faceId={productImages[activeCalibrationIndex ?? 0]?.face || "front"}
          initialPrintArea={productImages[activeCalibrationIndex ?? 0]?.printArea}
          onSave={handleSaveCalibration}
          onSaveAll={(updatedBlankImages: ProductImageItem[], faceConfigMap?: any) => {
            setProductImages((prev) => {
              return prev.map((img) => {
                const match = updatedBlankImages.find((u) => u.id === img.id || (u.colorHex === img.colorHex && u.face === img.face && (u.type || "blank") === (img.type || "blank")));
                if (match) {
                  return { ...img, printArea: match.printArea };
                }
                return img;
              });
            });
            if (faceConfigMap) {
              setCustomizationConfig((prev: any) => ({
                ...(prev || {}),
                enabled: prev?.enabled ?? true,
                faces: {
                  ...(prev?.faces || {}),
                  ...faceConfigMap,
                },
              }));
            }
            setHasUnsavedChanges(true);
            setActiveCalibrationIndex(null);
          }}
          onClose={() => setActiveCalibrationIndex(null)}
        />`;

editPageCode = editPageCode.replace(/<PrintAreaEditorModal[\s\S]*?\/>/, newModalEdit);
fs.writeFileSync(editPagePath, editPageCode, 'utf8');
console.log('✅ [id]/edit/page.tsx updated successfully in admin!');

console.log('🎉 All admin files upgraded successfully!');
