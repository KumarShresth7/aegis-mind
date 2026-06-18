from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine

class PIIRedactionService:
    def __init__(self):
        print("[PII Service] Booting up NLP Analyzer...")
        self.analyzer = AnalyzerEngine()
        self.anonymizer = AnonymizerEngine()
        
        self.target_entities = [
            "CREDIT_CARD", 
            "EMAIL_ADDRESS", 
            "IBAN_CODE", 
            "IP_ADDRESS", 
            "PHONE_NUMBER", 
            "US_SSN", 
            "PERSON"
        ]

    def sanitize_text(self, text: str) -> dict:
        """
        Analyzes the prompt, redacts PII, and returns the sanitized 
        text along with a map of what was removed.
        """
        if not text:
            return {"sanitized_text": text, "mapping": {}, "has_pii": False}

        analyzer_results = self.analyzer.analyze(
            text=text,
            entities=self.target_entities,
            language='en'
        )

        anonymized_result = self.anonymizer.anonymize(
            text=text,
            analyzer_results=analyzer_results
        )

        sanitized_text = anonymized_result.text
        
        mapping = {}
        for item in anonymized_result.items:
            # item.entity_type e.g., 'EMAIL_ADDRESS'
            # item.text e.g., '<EMAIL_ADDRESS>'
            mapping[item.entity_type] = True 

        return {
            "sanitized_text": sanitized_text,
            "mapping": mapping,
            "has_pii": len(mapping) > 0
        }

pii_service = PIIRedactionService()